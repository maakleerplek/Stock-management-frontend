"""Entry point for gunicorn. One worker only: the laser state lives in memory and
the worker owns the ESP's UDP port; threads serve the requests and Socket.IO."""
import app

app.start()
application = app.app
