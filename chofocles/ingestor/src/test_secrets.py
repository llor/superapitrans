"""Tests del módulo secrets.py — verifica compatibilidad con secrets.js de la API."""
from __future__ import annotations

import base64
import os
import sys
import unittest
from pathlib import Path

# Permitir importar secrets.py como hermano
sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ['CHOFOCLES_SECRETS_KEY'] = base64.b64encode(os.urandom(32)).decode('ascii')

import secrets as ssm  # noqa: E402


class TestSecrets(unittest.TestCase):

    def setUp(self):
        ssm._reset_key_cache()

    def test_roundtrip(self):
        original = 'unaContraseña123!'
        encoded = ssm.encrypt(original)
        self.assertNotEqual(encoded, original)
        self.assertEqual(ssm.decrypt(encoded), original)

    def test_no_ascii(self):
        original = 'mañana es jueves — clave: ñoño@ácido€¿?'
        self.assertEqual(ssm.decrypt(ssm.encrypt(original)), original)

    def test_iv_aleatorio(self):
        a = ssm.encrypt('hola')
        b = ssm.encrypt('hola')
        self.assertNotEqual(a, b)

    def test_authtag_manipulado(self):
        encoded = ssm.encrypt('xyz')
        buf = bytearray(base64.b64decode(encoded))
        buf[-1] ^= 0xff
        manipulado = base64.b64encode(bytes(buf)).decode('ascii')
        with self.assertRaises(Exception):
            ssm.decrypt(manipulado)

    def test_payload_corto(self):
        with self.assertRaises(ValueError):
            ssm.decrypt(base64.b64encode(b'\x00' * 10).decode('ascii'))

    def test_clave_invalida(self):
        old = os.environ.get('CHOFOCLES_SECRETS_KEY')
        os.environ['CHOFOCLES_SECRETS_KEY'] = base64.b64encode(b'\x00' * 16).decode('ascii')
        ssm._reset_key_cache()
        try:
            with self.assertRaises(RuntimeError) as ctx:
                ssm.encrypt('hola')
            self.assertIn('32 bytes', str(ctx.exception))
        finally:
            os.environ['CHOFOCLES_SECRETS_KEY'] = old
            ssm._reset_key_cache()

    def test_clave_ausente(self):
        old = os.environ.pop('CHOFOCLES_SECRETS_KEY', None)
        ssm._reset_key_cache()
        try:
            with self.assertRaises(RuntimeError) as ctx:
                ssm.encrypt('hola')
            self.assertIn('no definida', str(ctx.exception))
        finally:
            if old is not None:
                os.environ['CHOFOCLES_SECRETS_KEY'] = old
            ssm._reset_key_cache()


if __name__ == '__main__':
    unittest.main()
