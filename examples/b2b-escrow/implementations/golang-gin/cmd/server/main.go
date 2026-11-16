package main

import (
	"context"
	"encoding/json"
	"example.com/escrow/internal/httpapi"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	port := flag.Int("port", 8081, "Loopback port (0 selects available port)")
	testMode := flag.Bool("test-mode", false, "Enable trusted test identity and clock headers")
	mode := flag.String("mode", "v2", "v1 or v2")
	fault := flag.String("fault", "none", "none, accept-derived, extra-field, clock or precision")
	flag.Parse()
	if flag.NArg() != 0 || !*testMode || *port < 0 || *port > 65535 || (*mode != "v1" && *mode != "v2") || *fault == "" || !httpapi.ValidFault(*fault) {
		fmt.Fprintln(os.Stderr, "Requires --test-mode, valid --port, --mode v1|v2 and a supported --fault")
		os.Exit(1)
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	server := &http.Server{Handler: httpapi.New(httpapi.Options{TestMode: true, Mode: *mode, Fault: *fault}), ReadHeaderTimeout: 5 * time.Second}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"host": "http://" + listener.Addr().String()})
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	if err = server.Serve(listener); err != nil && err != http.ErrServerClosed {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
