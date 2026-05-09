#!/bin/bash
# Day 5 E2E verification commands
# Replace YOUR_JWT and YOUR_RAILWAY_URL before running

BASE=https://mike-production-bc69.up.railway.app

# Test 1: Health check
curl $BASE/health

# Test 2: Upload a PDF
curl -X POST $BASE/api/v1/documents/upload \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "file=@test-contract.pdf"

# Test 3: Check document status (replace DOC_ID)
curl $BASE/api/v1/documents \
  -H "Authorization: Bearer YOUR_JWT"

# Test 4: Ask a question with document context (replace DOC_ID and CONV_ID)
curl -N \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hva er oppsigelsestiden i denne avtalen?","documentId":"DOC_ID"}' \
  $BASE/api/v1/ai/chat

# Test 5: Ask a general question (no document)
curl -N \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hva er oppsigelsestiden for fast ansatte under Arbeidsmiljøloven?"}' \
  $BASE/api/v1/ai/chat

# Test 6: Verify rate limiting (run 11 times, 11th should 429)
for i in {1..11}; do
  echo "Query $i:"
  curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer YOUR_JWT" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hva er oppsigelsestiden?"}' \
    $BASE/api/v1/ai/chat
  echo
done
