# File Upload Validation System

## Overview

The AI Validator now includes comprehensive input validation for file uploads, providing security, reliability, and better user experience through multi-layered validation checks.

## Validation Layers

### 1. File-Level Validation

#### Size Limits
- **Maximum file size**: 10MB (configurable)
- **Minimum file size**: 1 byte (non-empty files)
- **Total files limit**: 2 files maximum

#### File Type Validation
- **Allowed extensions**: `.json`, `.yaml`, `.yml`, `.txt`
- **Allowed MIME types**:
  - `application/json`
  - `text/json`
  - `text/yaml`, `text/yml`
  - `application/yaml`, `application/x-yaml`
  - `text/plain` (with content validation)

#### Content Structure Validation
- **JSON validation**: Syntax checking and structure validation
- **YAML validation**: Safe loading with JSON schema compliance
- **Object depth limit**: Maximum 20 levels of nesting
- **Array size limit**: Maximum 10,000 elements
- **String length limit**: Maximum 50,000 characters per string

### 2. Security Validation

#### Malicious Content Detection
- **Script injection prevention**: Removes `<script>` tags and JavaScript URLs
- **Dangerous patterns**: Detects and blocks suspicious content patterns
- **File name sanitization**: Removes dangerous characters from filenames
- **Control character removal**: Strips control characters except newlines/tabs

#### DoS Attack Prevention
- **Excessive nesting protection**: Limits object depth to prevent stack overflow
- **Large array protection**: Prevents memory exhaustion from huge arrays
- **Long string protection**: Truncates excessively long strings
- **Property count limits**: Maximum 1,000 properties per object

#### Content Sanitization
- **BOM removal**: Strips Byte Order Mark characters
- **Line ending normalization**: Standardizes line endings
- **Whitespace cleanup**: Removes excessive whitespace sequences
- **Dangerous property filtering**: Blocks `__proto__`, `constructor`, etc.

### 3. Business Logic Validation

#### Required Files
- **API file**: Must be present with fieldname `api`, `apiFile`, or `apiDoc`
- **Model file**: Must be present with fieldname `model`, `modelFile`, or `modelSchema`
- **Content validation**: Both files must contain valid structured data

#### Content Requirements
- **Non-empty objects**: JSON objects cannot be empty
- **Non-empty arrays**: JSON arrays cannot be empty
- **Valid structure**: Content must be parseable as JSON or YAML
- **Object types**: Root content must be objects or arrays, not primitives

## API Endpoints

### File Upload with Validation

```bash
POST /comparison/upload
Content-Type: multipart/form-data

# Form fields:
# - apiFile: File (required)
# - modelFile: File (required) 
# - options: JSON string (optional)
```

### File Validation Only

```bash
POST /comparison/upload/validate
Content-Type: multipart/form-data

# Returns validation results without processing
```

### Example Response

#### Success Response
```json
{
  "api_name": "User API",
  "validation_date": "2025-09-24T10:30:00.000Z",
  "total_fields_compared": 12,
  "matched_fields": 8,
  "accuracy_score": 66.67,
  "fields": [...],
  "_metadata": {
    "fileValidation": {
      "filesValidated": 2,
      "timestamp": "2025-09-24T10:30:00.000Z"
    }
  }
}
```

#### Validation Error Response
```json
{
  "statusCode": 400,
  "timestamp": "2025-09-24T10:30:00.000Z",
  "path": "/comparison/upload",
  "method": "POST",
  "error": "Validation Failed",
  "message": "File validation failed: api: File size (12MB) exceeds maximum allowed size (10MB)",
  "validationErrors": {
    "apiFile": ["File too large", "Invalid content structure"]
  }
}
```

## Configuration

### Environment Variables

```env
# Validation Configuration
MAX_FILE_SIZE=10485760          # 10MB in bytes
MAX_FILES=2                     # Maximum files per request
VALIDATION_TIMEOUT=60000        # 60 seconds
NODE_ENV=production             # Affects error detail level
```

### Custom Validation Configuration

```typescript
const customConfig = {
  maxFileSize: 5 * 1024 * 1024,  // 5MB
  allowedMimeTypes: ['application/json'],
  allowedExtensions: ['.json'],
  maxFiles: 2,
  requireBothFiles: true,
};
```

## Frontend Integration

### Enhanced Error Handling

The frontend should handle validation errors gracefully:

```typescript
try {
  const response = await fetch('/comparison/upload', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    if (error.validationErrors) {
      // Handle specific validation errors
      displayValidationErrors(error.validationErrors);
    } else {
      // Handle general errors
      displayGeneralError(error.message);
    }
    return;
  }
  
  const result = await response.json();
  displayResults(result);
} catch (error) {
  displayNetworkError(error);
}
```

### Pre-Upload Validation

Implement client-side validation for better UX:

```typescript
function validateFileClient(file: File): string[] {
  const errors: string[] = [];
  
  // Size check
  if (file.size > 10 * 1024 * 1024) {
    errors.push('File size exceeds 10MB limit');
  }
  
  // Type check
  const allowedTypes = ['.json', '.yaml', '.yml'];
  const extension = file.name.toLowerCase().split('.').pop();
  if (!allowedTypes.includes(`.${extension}`)) {
    errors.push('Invalid file type. Use JSON or YAML files.');
  }
  
  return errors;
}
```

## Security Features

### Protection Against Common Attacks

1. **File Upload Attacks**
   - Malicious file content detection
   - Filename sanitization
   - MIME type validation

2. **DoS Attacks**
   - File size limits
   - Processing timeout limits
   - Memory usage protection

3. **Code Injection**
   - Script tag removal
   - JavaScript URL blocking
   - Dangerous property filtering

4. **Data Validation**
   - Input sanitization
   - Structure validation
   - Content depth limits

## Monitoring and Logging

### Validation Metrics

All validation attempts are logged with metrics:

```json
{
  "timestamp": "2025-09-24T10:30:00.000Z",
  "event": "file_validation",
  "files_processed": 2,
  "validation_time_ms": 45,
  "errors": [],
  "warnings": ["File detected as plain text but contains JSON"]
}
```

### Security Alerts

Security violations are logged as warnings:

```json
{
  "timestamp": "2025-09-24T10:30:00.000Z",
  "level": "WARN",
  "event": "security_violation",
  "type": "dangerous_content_detected",
  "pattern": "javascript:",
  "filename": "suspicious_file.json",
  "client_ip": "192.168.1.100"
}
```

## Testing

### Unit Tests

Test validation logic with various scenarios:

```bash
npm run test src/validation/
```

### Integration Tests

Test complete upload flow:

```bash
# Valid files
curl -X POST http://localhost:3100/comparison/upload \
  -F "apiFile=@test/fixtures/valid-api.json" \
  -F "modelFile=@test/fixtures/valid-model.json"

# Invalid files
curl -X POST http://localhost:3100/comparison/upload \
  -F "apiFile=@test/fixtures/malicious.js" \
  -F "modelFile=@test/fixtures/empty.json"

# Oversized files
curl -X POST http://localhost:3100/comparison/upload \
  -F "apiFile=@test/fixtures/huge-file.json" \
  -F "modelFile=@test/fixtures/valid-model.json"
```

## Best Practices

### For Developers

1. **Always validate**: Use the validation service for all file inputs
2. **Sanitize content**: Apply sanitization before processing
3. **Handle errors gracefully**: Provide meaningful error messages
4. **Log security events**: Monitor for malicious attempts

### For Users

1. **Use standard formats**: Stick to JSON or YAML files
2. **Keep files reasonable**: Avoid extremely large or complex files
3. **Check file content**: Ensure files contain valid structured data
4. **Use descriptive names**: Avoid special characters in filenames

## Troubleshooting

### Common Issues

1. **File Too Large**
   - Solution: Reduce file size or increase limit
   - Check: `MAX_FILE_SIZE` configuration

2. **Invalid File Type**
   - Solution: Convert to JSON or YAML format
   - Check: File extension and MIME type

3. **Content Validation Failed**
   - Solution: Verify JSON/YAML syntax
   - Check: File encoding and structure

4. **Security Violation**
   - Solution: Remove suspicious content
   - Check: File for scripts or dangerous patterns

This validation system provides enterprise-level security and reliability for file uploads while maintaining excellent user experience.