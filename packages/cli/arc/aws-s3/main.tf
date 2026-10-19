# A private, versioned S3 bucket + an IAM user scoped to that bucket only,
# with an access key. The Atlas-binding pattern on AWS: the project gets its
# own bucket and credentials, injected into sibling container services.

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "bucket" {
  type = string
}

variable "username" {
  type = string
}

variable "cors_origins" {
  type    = list(string)
  default = []
}

resource "aws_s3_bucket" "main" {
  bucket = var.bucket
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "main" {
  count  = length(var.cors_origins) > 0 ? 1 : 0
  bucket = aws_s3_bucket.main.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = var.cors_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_iam_user" "main" {
  name = var.username
}

resource "aws_iam_user_policy" "main" {
  name = "${var.username}-s3"
  user = aws_iam_user.main.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.main.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.main.arn}/*"
      },
    ]
  })
}

resource "aws_iam_access_key" "main" {
  user = aws_iam_user.main.name
}

data "aws_region" "current" {}

output "bucket" {
  value = aws_s3_bucket.main.bucket
}

output "region" {
  value = data.aws_region.current.name
}

output "access_key_id" {
  value = aws_iam_access_key.main.id
}

output "secret_access_key" {
  value     = aws_iam_access_key.main.secret
  sensitive = true
}
