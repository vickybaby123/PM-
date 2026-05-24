import os
import sys

# Vercel 运行时 /var/task 是项目根目录
sys.path.insert(0, "/var/task")

from backend.main import app
from mangum import Mangum

handler = Mangum(app, lifespan="off")
