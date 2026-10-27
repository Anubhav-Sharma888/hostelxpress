from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import Settings, is_loopback

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    id: UUID
    is_demo: bool


def demo_token(settings: Settings, user_id: UUID) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({'sub': str(user_id), 'iss': 'hostelxpress-local-demo', 'aud': 'hostelxpress-demo',
                       'iat': now, 'exp': now + timedelta(hours=6), 'mode': 'demo'},
                      settings.demo_jwt_secret, algorithm='HS256')


def require_local_demo(request: Request):
    if not request.app.state.settings.is_demo:
        raise HTTPException(404, 'Not found')
    if not is_loopback(request.client.host if request.client else None):
        raise HTTPException(403, 'Demo access is restricted to this Linux development machine')


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Principal:
    settings = request.app.state.settings
    if credentials is None or credentials.scheme.lower() != 'bearer':
        raise HTTPException(401, 'A valid student access token is required', headers={'WWW-Authenticate':'Bearer'})
    token = credentials.credentials
    try:
        if settings.is_demo:
            require_local_demo(request)
            claims = jwt.decode(token, settings.demo_jwt_secret, algorithms=['HS256'],
                                issuer='hostelxpress-local-demo', audience='hostelxpress-demo',
                                options={'require':['sub','iss','aud','iat','exp']})
            if claims.get('mode') != 'demo':
                raise jwt.InvalidTokenError('Wrong mode')
        else:
            jwks: PyJWKClient = request.app.state.jwks
            key = jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(token, key.key, algorithms=['RS256','ES256'], issuer=settings.issuer,
                                audience='authenticated', options={'require':['sub','iss','aud','exp']})
            if claims.get('role') != 'authenticated':
                raise jwt.InvalidTokenError('Wrong role')
        return Principal(UUID(claims['sub']), settings.is_demo)
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, 'Invalid or expired access token', headers={'WWW-Authenticate':'Bearer'}) from None
