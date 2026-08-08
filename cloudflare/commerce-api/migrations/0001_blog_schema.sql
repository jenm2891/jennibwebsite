CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  email_verification_token_hash TEXT NOT NULL DEFAULT '',
  email_verification_expires_at TEXT NOT NULL DEFAULT '',
  password_reset_token_hash TEXT NOT NULL DEFAULT '',
  password_reset_expires_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  allow_interactions INTEGER NOT NULL DEFAULT 1,
  allow_comments INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  subscribed_at TEXT NOT NULL
);
