import os
from pathlib import Path
import signal
import subprocess
import sys


directory = Path(sys.argv[1])
deadline = float(sys.argv[2])
try:
    child = subprocess.Popen(sys.argv[3:], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
except FileNotFoundError as error:
    print(f"Diagnostic child setup failed: {error}", file=sys.stderr)
    sys.exit(127)

timed_out = False
try:
    stdout, stderr = child.communicate(timeout=deadline)
except subprocess.TimeoutExpired:
    timed_out = True
    os.kill(child.pid, signal.SIGSTOP)
    trace_path = directory / f"native-shutdown-{child.pid}.log"
    command = [
        "/usr/bin/sudo", "-n", "/usr/bin/timeout", "--signal=TERM", "--kill-after=2s", "8s",
        "/usr/bin/gdb", "--batch", "--nx", "--nh", "--quiet",
        "-iex", "set auto-load off", "-ex", "set pagination off",
        "-ex", "set print frame-arguments none",
        "-ex", "thread apply all bt 16", "-ex", "detach", "-p", str(child.pid),
    ]
    try:
        try:
            trace = subprocess.run(command, capture_output=True, timeout=15)
            trace_path.write_bytes(
                f"Diagnostic only; owned child={child.pid}; gdb exit={trace.returncode}\n".encode()
                + trace.stdout + trace.stderr
            )
        except FileNotFoundError as error:
            trace_path.write_text(f"Native backtrace unavailable: {error}\n")
        except subprocess.TimeoutExpired as error:
            trace_path.write_bytes(
                b"Native backtrace incomplete: debugger deadline exceeded\n"
                + (error.stdout or b"") + (error.stderr or b"")
            )
    finally:
        if child.poll() is None:
            os.kill(child.pid, signal.SIGCONT)
            child.terminate()
        try:
            stdout, stderr = child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            stdout, stderr = child.communicate()
    print(f"Diagnostic child deadline exceeded; trace={trace_path}", file=sys.stderr)

sys.stdout.buffer.write(stdout)
sys.stderr.buffer.write(stderr)
sys.exit(124 if timed_out else child.returncode if child.returncode >= 0 else 128 - child.returncode)
