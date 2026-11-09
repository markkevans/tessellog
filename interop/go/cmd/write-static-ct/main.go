package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/markkevans/tessellog/interop/internal/ctentries"
	"github.com/transparency-dev/tessera"
	"github.com/transparency-dev/tessera/storage/posix"
	"golang.org/x/mod/sumdb/note"
)

var (
	storageDir = flag.String("storage_dir", "", "Root directory for the static-CT log.")
	privateKey = flag.String("private_key", "", "File holding the log's note signer key.")
	count      = flag.Int("count", 0, "Number of entries to add.")
)

func main() {
	flag.Parse()
	if err := run(context.Background()); err != nil {
		fmt.Fprintln(os.Stderr, "write-static-ct:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	raw, err := os.ReadFile(*privateKey)
	if err != nil {
		return fmt.Errorf("read private key: %w", err)
	}
	signer, err := note.NewSigner(strings.TrimSpace(string(raw)))
	if err != nil {
		return fmt.Errorf("parse private key: %w", err)
	}
	driver, err := posix.New(ctx, posix.Config{Path: *storageDir})
	if err != nil {
		return fmt.Errorf("open storage: %w", err)
	}
	opts := tessera.NewAppendOptions().
		WithCheckpointSigner(signer).
		WithCTLayout().
		WithBatching(uint(*count), 100*time.Millisecond).
		WithCheckpointInterval(100 * time.Millisecond)
	appender, shutdown, _, err := tessera.NewAppender(ctx, driver, opts)
	if err != nil {
		return fmt.Errorf("create appender: %w", err)
	}
	add := tessera.NewCertificateTransparencyAppender(appender)
	futures := make([]tessera.IndexFuture, *count)
	for i := range futures {
		futures[i] = add(ctx, ctentries.Entry(i))
	}
	for i, future := range futures {
		if _, err := future(); err != nil {
			return fmt.Errorf("add entry %d: %w", i, err)
		}
	}
	return shutdown(ctx)
}
