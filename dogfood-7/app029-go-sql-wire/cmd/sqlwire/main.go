package main

import (
	"flag"
	"log"
	"net"
	"time"

	"example.com/sqlwire/internal/auth"
	"example.com/sqlwire/server"
)

func main() {
	port := flag.Uint("port", 55432, "loopback TCP port")
	flag.Parse()
	if *port > 65535 {
		log.Fatal("invalid port")
	}
	addr := &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: int(*port)}
	listener, err := net.ListenTCP("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()
	policy := auth.NewPolicy([]string{"demo"})
	log.Printf("wire-lite local trust listener: %s; role=demo", listener.Addr())
	limit := make(chan struct{}, 64)
	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Print(err)
			return
		}
		select {
		case limit <- struct{}{}:
			go func() {
				defer func() { <-limit }()
				conn.SetDeadline(time.Now().Add(5 * time.Minute))
				if err := server.Serve(conn, policy); err != nil {
					log.Printf("connection: %v", err)
				}
			}()
		default:
			conn.Close()
		}
	}
}
