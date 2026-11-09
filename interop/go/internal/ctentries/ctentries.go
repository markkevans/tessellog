package ctentries

import (
	"fmt"

	"github.com/transparency-dev/tessera/ctonly"
)

const baseTimestamp = 1794177863000

func filled(b byte) [32]byte {
	var f [32]byte
	for i := range f {
		f[i] = b
	}
	return f
}

func Entry(i int) *ctonly.Entry {
	e := &ctonly.Entry{
		Timestamp:         uint64(baseTimestamp + i),
		FingerprintsChain: [][32]byte{filled(0xaa), filled(byte(i % 256))},
	}
	if i%3 == 0 {
		issuer := filled(byte(i % 256))
		e.IsPrecert = true
		e.Certificate = []byte(fmt.Sprintf("tbs certificate %d", i))
		e.Precertificate = []byte(fmt.Sprintf("precertificate %d", i))
		e.IssuerKeyHash = issuer[:]
		return e
	}
	e.Certificate = []byte(fmt.Sprintf("certificate %d", i))
	return e
}
