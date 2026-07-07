import time
import os
import sys

# Add ml-service to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ml-service'))
import main

print("Loading artifacts...")
main.load_artifacts()

print("Measuring _get_svd_scores...")
start = time.time()
scores = main._get_svd_scores(88077)  # some proxy_svd_id
end = time.time()

print(f"Time taken: {end - start:.4f} seconds")
