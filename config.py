import os

# IB Gateway settings
IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", 7497))
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", 1))
IB_ACCOUNT = os.getenv("IB_ACCOUNT", "")

# vnpy_webtrader settings
WEBTRADER_HOST = os.getenv("WEBTRADER_HOST", "0.0.0.0")
WEBTRADER_PORT = int(os.getenv("WEBTRADER_PORT", 8000))
WEBTRADER_USERNAME = os.getenv("WEBTRADER_USERNAME", "admin")
WEBTRADER_PASSWORD = os.getenv("WEBTRADER_PASSWORD", "password")
