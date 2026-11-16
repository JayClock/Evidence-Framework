package domain

import (
	"encoding/json"
	"math/big"
	"testing"
)

func rejects(t *testing.T, fn func()) {
	t.Helper()
	defer func() {
		if recover() == nil {
			t.Error("expected rejection")
		}
	}()
	fn()
}
func TestIntegerWireBoundary(t *testing.T) {
	for _, v := range []any{true, 1.5, json.Number("9007199254740992"), "9223372036854775808", "01", "-0"} {
		t.Run("invalid", func(t *testing.T) { rejects(t, func() { integer(v) }) })
	}
	if integer("9223372036854775807") != int64(9223372036854775807) {
		t.Fatal("lost precision")
	}
	if Representation(Fact{Data: Data{"large": int64(9007199254740993), "zero": int64(0)}})["large"] != "9007199254740993" {
		t.Fatal("unsafe wire number")
	}
}
func TestMoneyAndTime(t *testing.T) {
	if round(1354870, 500) != 67744 {
		t.Fatal("half-up failed")
	}
	d := Settle(22600000000000002, 500, 100, 1)
	if d["payout_minor"] != int64(21244000000000002) {
		t.Fatal(d)
	}
	d = Settle(1356225, 500, 100, 1000000)
	if d["payout_minor"] != int64(0) {
		t.Fatal("cap", d)
	}
	total := new(big.Int)
	for _, k := range []string{"retention_minor", "late_penalty_minor", "payout_minor"} {
		total.Add(total, big.NewInt(d[k].(int64)))
	}
	if total.Int64() != 1356225 {
		t.Fatal("conservation")
	}
	for _, test := range []struct {
		now  string
		want int64
	}{{"2026-06-01T00:00:00Z", 0}, {"2026-06-01T00:00:01Z", 1}, {"2026-06-16T00:00:00Z", 15}} {
		n, _ := ParseTime(test.now)
		if LateDays(n, "2026-06-01T00:00:00Z") != test.want {
			t.Fatal(test)
		}
	}
	rejects(t, func() { round(9223372036854775807, 20000) })
}
