import os
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PRIVATE = Path(os.environ.get('DFO_OWNER_PRIVATE', BASE/'private'))
LOCAL = os.environ.get('DFO_OWNER_LOCAL') == '1'
PRIVATE.mkdir(parents=True, exist_ok=True, mode=0o700)
SECRET_KEY = (PRIVATE/'django-key').read_text().strip()
PROXY_KEY = (PRIVATE/'proxy-key').read_text().strip()
DEBUG = False
ALLOWED_HOSTS = ['127.0.0.1', 'localhost', 'testserver'] if LOCAL else ['dfo.spaceghosts.com']
ROOT_URLCONF = 'portal.urls'
WSGI_APPLICATION = 'portal.wsgi.application'
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'portal']
MIDDLEWARE = ['portal.security.Boundary', 'django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware']
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': PRIVATE/'owners.sqlite3', 'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE'}}}
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [BASE/'templates'], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages']}}]
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'}, {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 14}}, {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'}, {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'}]
SESSION_COOKIE_NAME = 'dfo_owner_local' if LOCAL else '__Host-dfo_owner'
SESSION_COOKIE_SECURE = not LOCAL
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Strict'
SESSION_COOKIE_AGE = 7 * 86400
SESSION_SAVE_EVERY_REQUEST = False
CSRF_COOKIE_NAME = 'dfo_csrf_local' if LOCAL else '__Host-dfo_csrf'
CSRF_COOKIE_SECURE = not LOCAL
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Strict'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if not LOCAL else None
SECURE_SSL_REDIRECT = not LOCAL
SECURE_HSTS_SECONDS = 31536000 if not LOCAL else 0
# Match the existing hostname policy; this project does not own sibling domains
# or opt the borrowed domain into browser preload registration.
SILENCED_SYSTEM_CHECKS = ['security.W005', 'security.W021']
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'no-referrer'
DATA_UPLOAD_MAX_MEMORY_SIZE = 6 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 6 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 30
DATA_UPLOAD_MAX_NUMBER_FILES = 1
LOGIN_URL = '/owner/login/'
LOGIN_REDIRECT_URL = '/owner/'
LOGOUT_REDIRECT_URL = '/owner/login/'
TIME_ZONE = 'UTC'
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
SNAPSHOT = Path(os.environ.get('DFO_SNAPSHOT', '/var/www/lastlife-hub/daggerfall/vendors.json'))
GAME_PROBE = os.environ.get('DFO_GAME_PROBE', '/home/ryan/dfotimer-observer/claim-proof.mjs')
NODE = os.environ.get('DFO_NODE', '/usr/bin/node')
PUBLIC_ROOT = Path(os.environ.get('DFO_PUBLIC_ROOT', '/var/www/lastlife-hub/daggerfall'))
MEDIA_ROOT = PRIVATE/'media'
MEDIA_ROOT.mkdir(exist_ok=True, mode=0o700)
PUBLIC_ORIGIN = 'https://dfo.spaceghosts.com'
LOGGING = {'version': 1, 'disable_existing_loggers': False, 'handlers': {'null': {'class': 'logging.NullHandler'}}, 'loggers': {'django.request': {'handlers': ['null'], 'propagate': False}, 'django.security': {'handlers': ['null'], 'propagate': False}}}
