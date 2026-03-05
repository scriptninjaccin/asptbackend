param(
  [string]$EndpointUrl = "http://localhost:8000",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

function Test-TableExists {
  param([string]$TableName)

  aws dynamodb describe-table `
    --table-name $TableName `
    --endpoint-url $EndpointUrl `
    --region $Region `
    | Out-Null

  return $LASTEXITCODE -eq 0
}

function New-TableFromJson {
  param(
    [string]$TableName,
    [string]$JsonBody
  )

  if (Test-TableExists -TableName $TableName) {
    Write-Host "Table '$TableName' already exists. Skipping."
    return
  }

  $tmpFile = Join-Path $env:TEMP ("ddb-" + $TableName + ".json")
  Set-Content -Path $tmpFile -Value $JsonBody -Encoding UTF8

  $resolvedPath = (Get-Item -LiteralPath $tmpFile).FullName
  $tmpFileUri = "file://" + ($resolvedPath -replace "\\", "/")

  try {
    Write-Host "Creating table '$TableName'..."
    aws dynamodb create-table `
      --cli-input-json $tmpFileUri `
      --endpoint-url $EndpointUrl `
      --region $Region `
      | Out-Null
  }
  finally {
    Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
  }
}

$usersTable = @"
{
  "TableName": "users",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "studentId", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "studentId", "KeyType": "HASH" }
  ]
}
"@

$admissionsTable = @"
{
  "TableName": "admission_applications",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "id", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "id", "KeyType": "HASH" }
  ]
}
"@

$noticesTable = @"
{
  "TableName": "notices",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "id", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "id", "KeyType": "HASH" }
  ]
}
"@

$feePaymentsTable = @"
{
  "TableName": "fee_payments",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "id", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "id", "KeyType": "HASH" }
  ]
}
"@

$classFeesTable = @"
{
  "TableName": "class_fees",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "className", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "className", "KeyType": "HASH" }
  ]
}
"@

$galleryTable = @"
{
  "TableName": "gallery_media",
  "BillingMode": "PAY_PER_REQUEST",
  "AttributeDefinitions": [
    { "AttributeName": "id", "AttributeType": "S" }
  ],
  "KeySchema": [
    { "AttributeName": "id", "KeyType": "HASH" }
  ]
}
"@

Write-Host "Ensuring local DynamoDB tables exist at $EndpointUrl ($Region)..."

New-TableFromJson -TableName "users" -JsonBody $usersTable
New-TableFromJson -TableName "admission_applications" -JsonBody $admissionsTable
New-TableFromJson -TableName "notices" -JsonBody $noticesTable
New-TableFromJson -TableName "fee_payments" -JsonBody $feePaymentsTable
New-TableFromJson -TableName "class_fees" -JsonBody $classFeesTable
New-TableFromJson -TableName "gallery_media" -JsonBody $galleryTable

Write-Host "Done."
