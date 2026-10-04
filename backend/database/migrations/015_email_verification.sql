CREATE INDEX IF NOT EXISTS idx_otp_tokens_verification
  ON otp_tokens(user_id, expires_at)
  WHERE purpose = 'EMAIL_VERIFY';

CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_tokens_verification_hash
  ON otp_tokens(token_hash)
  WHERE purpose = 'EMAIL_VERIFY';
