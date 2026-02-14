# deposim

## S3 large recording uploads

Body-language recordings are uploaded directly to S3 via presigned multipart URLs (supports hour+ recordings). Add to `.env`:

```
S3_BUCKET=your-bucket-name
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

Or use an IAM role if running on AWS. Ensure the S3 bucket has CORS configured for your frontend origin:

```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "POST", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```
