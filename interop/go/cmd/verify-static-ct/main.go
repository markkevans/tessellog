package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/markkevans/tessellog/interop/internal/ctentries"
	fnote "github.com/transparency-dev/formats/note"
	"github.com/transparency-dev/merkle/proof"
	"github.com/transparency-dev/merkle/rfc6962"
	"github.com/transparency-dev/tessera/api/layout"
	"github.com/transparency-dev/tessera/client"
)

const bundleWidth = 256

var (
	storageDir = flag.String("storage_dir", "", "Root directory of the static-CT log.")
	vkey       = flag.String("vkey", "", "RFC 6962 verifier key of the log.")
	origin     = flag.String("origin", "", "Origin of the log.")
	count      = flag.Int("count", 0, "Number of entries the log must hold.")
)

func main() {
	flag.Parse()
	if err := run(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "verify-static-ct:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	verifier, err := fnote.NewRFC6962Verifier(*vkey)
	if err != nil {
		return fmt.Errorf("parse verifier key: %w", err)
	}
	fetcher := client.FileFetcher{Root: *storageDir}
	checkpoint, _, _, err := client.FetchCheckpoint(ctx, fetcher.ReadCheckpoint, verifier, *origin)
	if err != nil {
		return fmt.Errorf("open checkpoint: %w", err)
	}
	if checkpoint.Size != uint64(*count) {
		return fmt.Errorf("checkpoint size %d, want %d", checkpoint.Size, *count)
	}
	builder, err := client.NewProofBuilder(ctx, checkpoint.Size, fetcher.ReadTile)
	if err != nil {
		return fmt.Errorf("create proof builder: %w", err)
	}
	for bundleIndex := uint64(0); bundleIndex*bundleWidth < checkpoint.Size; bundleIndex++ {
		partial := layout.PartialTileSize(0, bundleIndex, checkpoint.Size)
		path := filepath.Join(*storageDir, "tile", "data", layout.NWithSuffix(0, bundleIndex, partial))
		stored, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read data tile: %w", err)
		}
		var expected []byte
		for index := bundleIndex * bundleWidth; index < min((bundleIndex+1)*bundleWidth, checkpoint.Size); index++ {
			entry := ctentries.Entry(int(index))
			expected = append(expected, entry.LeafData(index)...)
			inclusion, err := builder.InclusionProof(ctx, index)
			if err != nil {
				return fmt.Errorf("build inclusion proof for %d: %w", index, err)
			}
			if err := proof.VerifyInclusion(rfc6962.DefaultHasher, index, checkpoint.Size, entry.MerkleLeafHash(index), inclusion, checkpoint.Hash); err != nil {
				return fmt.Errorf("verify inclusion of %d: %w", index, err)
			}
		}
		if !bytes.Equal(stored, expected) {
			return fmt.Errorf("data tile %s differs from ctonly LeafData", path)
		}
	}
	fmt.Printf("Tessera's ctonly matched every TileLeaf and its client verified %d static-CT entries\n", checkpoint.Size)
	return nil
}
