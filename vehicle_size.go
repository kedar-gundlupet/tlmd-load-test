package main

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
)

const (
	vehicleWorkers = 3 // Number of goroutines
	vehicleDrivers = "data/houston_active.csv"
)

func main() {
	// Open CSV file
	file, err := os.Open(vehicleDrivers)
	if err != nil {
		log.Fatalf("Failed to open CSV file: %v", err)
	}
	defer file.Close()

	// Read CSV records
	reader := csv.NewReader(file)

	// Read header
	_, err = reader.Read()
	if err != nil {
		log.Fatalf("Failed to read CSV header: %v", err)
	}

	// Channel to send customer IDs to workers
	shopeprChan := make(chan string)

	// WaitGroup to wait for all workers to complete
	var wg sync.WaitGroup

	// Start worker goroutines
	for i := 0; i < vehicleWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for shopperID := range shopeprChan {
				vehicleReq(workerID, shopperID)
			}
		}(i + 1)
	}

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("Error reading CSV: %v", err)
			continue
		}
		shopperID := record[0]
		shopperID = strings.ReplaceAll(shopperID, `\"`, "")
		shopeprChan <- shopperID
	}

	close(shopeprChan) // Close channel to signal workers to stop
	wg.Wait()          // Wait for all workers to finish
}

// makeHTTPRequest simulates making a GET request for the customer ID
func vehicleReq(workerID int, customerID string) {
	url := fmt.Sprintf("https://vehicle.us-central1.staging.shipt.com/v2/vehicles/49436/assign/%s", customerID)

	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		log.Printf("[Worker %d] Error creating PATCH request for customer %s: %v", workerID, customerID, err)
		return
	}
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[Worker %d] Request failed for customer %s: %v", workerID, customerID, err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[Worker %d] Fetched data for customer %s (status: %s)", workerID, customerID, resp.Status)
}
