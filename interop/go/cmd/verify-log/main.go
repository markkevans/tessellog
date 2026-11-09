package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"slices"

	"github.com/transparency-dev/formats/log"
	fnote "github.com/transparency-dev/formats/note"
	"github.com/transparency-dev/merkle/proof"
	"github.com/transparency-dev/merkle/rfc6962"
	"github.com/transparency-dev/tessera/client"
	"golang.org/x/mod/sumdb/note"
)

const bundleWidth = 256

var (
	storageDir         = flag.String("storage_dir", "", "Root directory of the log.")
	vkey               = flag.String("vkey", "", "Verifier key of the log.")
	origin             = flag.String("origin", "", "Origin of the log.")
	previousCheckpoint = flag.String("previous_checkpoint", "", "An earlier checkpoint the latest must be consistent with.")
	entriesGlob        = flag.String("entries", "", "Glob of files whose contents must be exactly the log's entries.")
	witnessVkey        = flag.String("witness_vkey", "", "Optional cosignature verifier key of a witness that must have cosigned the latest checkpoint.")
)

func main() {
	flag.Parse()
	if err := run(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "verify-log:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	verifier, err := note.NewVerifier(*vkey)
	if err != nil {
		return fmt.Errorf("parse verifier key: %w", err)
	}
	fetcher := client.FileFetcher{Root: *storageDir}
	latest, _, _, err := client.FetchCheckpoint(ctx, fetcher.ReadCheckpoint, verifier, *origin)
	if err != nil {
		return fmt.Errorf("open latest checkpoint: %w", err)
	}
	builder, err := client.NewProofBuilder(ctx, latest.Size, fetcher.ReadTile)
	if err != nil {
		return fmt.Errorf("create proof builder: %w", err)
	}
	logged, err := verifiedEntries(ctx, fetcher, builder, latest)
	if err != nil {
		return err
	}
	if err := checkConsistency(ctx, builder, verifier, latest); err != nil {
		return err
	}
	if err := checkEntriesMatch(logged); err != nil {
		return err
	}
	if err := checkCosigned(ctx, fetcher); err != nil {
		return err
	}
	cosigned := ""
	if *witnessVkey != "" {
		cosigned = ", and formats/note verified the witness cosignature"
	}
	fmt.Printf("Tessera's client verified %d entries and consistency with the previous checkpoint%s\n", len(logged), cosigned)
	return nil
}

func verifiedEntries(ctx context.Context, fetcher client.FileFetcher, builder *client.ProofBuilder, latest *log.Checkpoint) ([]string, error) {
	var logged []string
	for bundleIndex := uint64(0); bundleIndex*bundleWidth < latest.Size; bundleIndex++ {
		bundle, err := client.GetEntryBundle(ctx, fetcher.ReadEntryBundle, bundleIndex, latest.Size)
		if err != nil {
			return nil, fmt.Errorf("read entry bundle %d: %w", bundleIndex, err)
		}
		for offset, entry := range bundle.Entries {
			index := bundleIndex*bundleWidth + uint64(offset)
			inclusion, err := builder.InclusionProof(ctx, index)
			if err != nil {
				return nil, fmt.Errorf("build inclusion proof for %d: %w", index, err)
			}
			leaf := rfc6962.DefaultHasher.HashLeaf(entry)
			if err := proof.VerifyInclusion(rfc6962.DefaultHasher, index, latest.Size, leaf, inclusion, latest.Hash); err != nil {
				return nil, fmt.Errorf("verify inclusion of %d: %w", index, err)
			}
			logged = append(logged, string(entry))
		}
	}
	if uint64(len(logged)) != latest.Size {
		return nil, fmt.Errorf("read %d entries from a log of size %d", len(logged), latest.Size)
	}
	return logged, nil
}

func checkConsistency(ctx context.Context, builder *client.ProofBuilder, verifier note.Verifier, latest *log.Checkpoint) error {
	raw, err := os.ReadFile(*previousCheckpoint)
	if err != nil {
		return fmt.Errorf("read previous checkpoint: %w", err)
	}
	previous, _, _, err := log.ParseCheckpoint(raw, *origin, verifier)
	if err != nil {
		return fmt.Errorf("open previous checkpoint: %w", err)
	}
	consistency, err := builder.ConsistencyProof(ctx, previous.Size, latest.Size)
	if err != nil {
		return fmt.Errorf("build consistency proof: %w", err)
	}
	if err := proof.VerifyConsistency(rfc6962.DefaultHasher, previous.Size, latest.Size, consistency, previous.Hash, latest.Hash); err != nil {
		return fmt.Errorf("verify consistency %d -> %d: %w", previous.Size, latest.Size, err)
	}
	return nil
}

func checkEntriesMatch(logged []string) error {
	files, err := filepath.Glob(*entriesGlob)
	if err != nil {
		return fmt.Errorf("expand entries glob: %w", err)
	}
	var expected []string
	for _, file := range files {
		contents, err := os.ReadFile(file)
		if err != nil {
			return fmt.Errorf("read %s: %w", file, err)
		}
		expected = append(expected, string(contents))
	}
	slices.Sort(expected)
	sorted := slices.Sorted(slices.Values(logged))
	if !slices.Equal(expected, sorted) {
		return fmt.Errorf("log holds %d entries that differ from the %d input files", len(sorted), len(expected))
	}
	return nil
}

func checkCosigned(ctx context.Context, fetcher client.FileFetcher) error {
	if *witnessVkey == "" {
		return nil
	}
	witness, err := fnote.NewVerifierForCosignatureV1(*witnessVkey)
	if err != nil {
		return fmt.Errorf("parse witness key: %w", err)
	}
	raw, err := fetcher.ReadCheckpoint(ctx)
	if err != nil {
		return fmt.Errorf("read checkpoint: %w", err)
	}
	n, err := note.Open(raw, note.VerifierList(witness))
	if err != nil {
		return fmt.Errorf("verify witness cosignature: %w", err)
	}
	if len(n.Sigs) != 1 {
		return fmt.Errorf("want 1 witness cosignature, got %d", len(n.Sigs))
	}
	return nil
}
