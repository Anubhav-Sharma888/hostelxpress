"""Operator-only device provisioning. Never expose this as a student API."""
from __future__ import annotations

import argparse
import json
import os
import secrets
from uuid import UUID

import psycopg


def main():
    parser=argparse.ArgumentParser(description='Provision an authenticated Hostelxpress hardware connector')
    parser.add_argument('command',choices=['provision-bot'])
    parser.add_argument('--bot-id',required=True,type=UUID)
    parser.add_argument('--rotate',action='store_true',help='Explicitly replace an existing device credential')
    args=parser.parse_args()
    database_url=os.environ.get('DATABASE_URL')
    if not database_url:
        parser.error('DATABASE_URL is required')
    secret=secrets.token_urlsafe(48)
    with psycopg.connect(database_url) as conn:
        existing=conn.execute('SELECT is_demo FROM public.bots WHERE id=%s FOR UPDATE',(args.bot_id,)).fetchone()
        if existing and existing[0]:
            parser.error('A demo bot cannot be provisioned for live hardware')
        if conn.execute('SELECT 1 FROM hostelxpress_private.device_credentials WHERE bot_id=%s',(args.bot_id,)).fetchone() and not args.rotate:
            parser.error('Credential already exists; --rotate is required to replace it')
        conn.execute('INSERT INTO public.bots(id) VALUES(%s) ON CONFLICT DO NOTHING',(args.bot_id,))
        conn.execute('INSERT INTO hostelxpress_private.device_state(bot_id) VALUES(%s) ON CONFLICT DO NOTHING',(args.bot_id,))
        for compartment in range(1,4):
            conn.execute('INSERT INTO hostelxpress_private.compartment_state(bot_id,compartment_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(args.bot_id,compartment))
        conn.execute('INSERT INTO hostelxpress_private.device_credentials(bot_id,secret) VALUES(%s,%s) ON CONFLICT(bot_id) DO UPDATE SET secret=EXCLUDED.secret,enabled=true',(args.bot_id,secret.encode()))
    # This is the sole intentional secret output, for an operator provisioning a
    # connector. Protect the receiving terminal/file and do not put it in Git.
    print(json.dumps({'bot_id':str(args.bot_id),'device_secret':secret,'warning':'Save this once in the device secret store; never share student or Supabase credentials'}))


if __name__=='__main__':
    main()
