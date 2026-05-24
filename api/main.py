import os
import sys

sys.path.insert(0, "/var/task")

from main import app
from mangum import Mangum

handler = Mangum(app, lifespan="off")
