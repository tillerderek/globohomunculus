# config.py
import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-default-key')  # Use env var or fallback for development
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

class DevelopmentConfig(Config):
    DEBUG = True
    ENV = 'development'

class ProductionConfig(Config):
    DEBUG = False
    ENV = 'production'
    SECRET_KEY = os.environ['SECRET_KEY']  # Force this to be explicitly set in prod
