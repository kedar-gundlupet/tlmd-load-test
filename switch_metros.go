package main

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
)

type certifyShopperRequest struct {
	Certifications []CertificationRequest `json:"certifications"`
}
type CertificationRequest struct {
	Name string `json:"name"`
}

const (
	numWorkers = 50 // Number of goroutines
	csvFile    = "gtp_shoppers.csv"
)

func main() {
	// Open CSV file
	file, err := os.Open(csvFile)
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
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for shopperID := range shopeprChan {
				makeHTTPRequest(workerID, shopperID)
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
		shopeprChan <- shopperID
	}

	close(shopeprChan) // Close channel to signal workers to stop
	wg.Wait()          // Wait for all workers to finish
}

// makeHTTPRequest simulates making a GET request for the customer ID
func makeHTTPRequest(workerID int, customerID string) {
	url := fmt.Sprintf("https://shopper-profile.us-central1.staging.shipt.com/v2/shoppers/%s", customerID)
	body := map[string]interface{}{
		"metro_id": "124",
	}
	jsonBody, err := json.Marshal(body)
	if err != nil {
		log.Printf("[Worker %d] Error marshaling JSON for customer %s: %v", workerID, customerID, err)
		return
	}
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewBuffer(jsonBody))
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

	//url = fmt.Sprintf("https://shopper-profile.us-central1.staging.shipt.com/v2/shoppers/%s/certify", customerID)
	//cert := certifyShopperRequest{
	//	Certifications: []CertificationRequest{{Name: "driver"}},
	//}
	//jsonBody, err = json.Marshal(cert)
	//if err != nil {
	//	log.Printf("[Worker %d] Error marshaling JSON for customer %s: %v", workerID, customerID, err)
	//	return
	//}
	//req, err = http.NewRequest(http.MethodPut, url, bytes.NewBuffer(jsonBody))
	//if err != nil {
	//	log.Printf("[Worker %d] Error creating PUT request for customer %s: %v", workerID, customerID, err)
	//	return
	//}
	//req.Header.Set("X-User-Type", "System")
	//req.Header.Set("X-User-Id", "0")
	//req.Header.Set("x-shipt-identifier", "kedar-local")
	//resp, err = client.Do(req)
	//if err != nil {
	//	log.Printf("[Worker %d] Request failed for customer %s: %v", workerID, customerID, err)
	//	return
	//}
	//defer resp.Body.Close()
	//log.Printf("[Worker %d] Fetched data for cert %s (status: %s)", workerID, customerID, resp.Status)
}
