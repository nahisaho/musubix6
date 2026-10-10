package main

import (
	"context"
	"dogfood.local/dns/cache"
	"dogfood.local/dns/resolver"
	"dogfood.local/dns/transport"
	"dogfood.local/dns/wire"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"
)

func main() {
	root := flag.String("root", "198.41.0.4:53", "initial DNS root endpoint")
	timeout := flag.Duration("timeout", 5*time.Second, "total lookup deadline")
	kind := flag.String("type", "A", "A, AAAA, NS or CNAME")
	flag.Parse()
	types := map[string]uint16{"A": wire.A, "AAAA": wire.AAAA, "NS": wire.NS, "CNAME": wire.CNAME}
	rrtype, ok := types[*kind]
	if !ok || flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: dns [-root host:port] [-type A|AAAA|NS|CNAME] domain")
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	r := resolver.Resolver{Exchange: transport.UDP{Timeout: *timeout}, Roots: []string{*root}, Cache: cache.New(256, time.Now), MaxSteps: 32}
	m, err := r.Resolve(ctx, wire.Question{Name: flag.Arg(0), Type: rrtype, Class: 1})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(m); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
