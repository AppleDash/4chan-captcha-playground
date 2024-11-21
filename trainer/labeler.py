import os
import sys
import shutil
import threading
import traceback
from pathlib import Path

from anticaptchaofficial.imagecaptcha import imagecaptcha
from concurrent.futures import ThreadPoolExecutor, as_completed

CHARACTER_SET = ['0', '2', '4', '8', 'A', 'D', 'G', 'H', 'J', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'V', 'W', 'X', 'Y']

INPUT = 'unsolved/'
OUTPUT = 'solved/'
FAILED = 'failed/'
INCORRECT = 'incorrect/'

API_KEY = os.getenv('ANTICAPTCHA_KEY')

solver_local = threading.local()

# Get or create the thread-local CAPTCHA solver instance.
def solver():
    if 'solver' in solver_local.__dict__:
        return solver_local.solver

    solver = imagecaptcha()
    solver.set_verbose(1)
    solver.set_key(API_KEY)
    solver.set_minLength(5)
    solver.set_maxLength(6)
    solver.set_comment("Only chars from: " + ''.join(CHARACTER_SET))

    solver_local.solver = solver
    return solver

def solve(path):
    sol = solver().solve_and_return_solution(path)

    if not sol:
        return None

    return sol

def try_solve(path):
    try:
        try:
            solution = solve(path)
        except Exception:
            traceback.print_exc()
            solution = None

        if not solution or len(solution) > 6:
            print(f"Failed to solve {path}")
            shutil.move(path, os.path.join(FAILED, os.path.basename(path)))
            return 'unsolved'

        if any(letter not in CHARACTER_SET for letter in solution.upper()):
            print(f"Invalid chars returned in {solution}")
            #solver().report_incorrect_image_captcha()
            shutil.move(path, os.path.join(INCORRECT, f"{solution}.png"))
            Path(os.path.join(INCORRECT, f"{solution}.png")).touch()
            return 'unsolved'

        out_path = os.path.join(OUTPUT, f"{solution}.png")
        shutil.move(path, out_path)
        Path(out_path).touch()

        print(f"Solved {path}")

        return 'ok'
    except Exception:
        traceback.print_exc()
        return 'fail'

def main(argv):
    if len(argv) != 2:
        print(f"usage: {argv[0]} <root dir>")
        return 1

    paths = []
    for root, dirs, files in os.walk(argv[1]):
        for file in files:
            path = os.path.join(root, file)
            if path.endswith('aligned.png'):
                paths.append(path)

    print(len(paths))

    with ThreadPoolExecutor(max_workers=10) as exe:
        futures = [exe.submit(try_solve, path) for path in paths]

        for future in as_completed(futures):
            print(future.result())


    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
