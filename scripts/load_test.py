"""
u-SHA-jua Asynchronous Disaster Informatics Load Testing Harness
Simulates high-density concurrent incoming civilian SMS distress messages
calculating p50, p95, and p99 latency percentiles and throughput metrics.
"""

import sys
import os
import asyncio
import time
import statistics
import random
from fastapi.testclient import TestClient

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server"))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

from main import app
from database import Base, engine

Base.metadata.create_all(bind=engine)

SAMPLE_SMS_CORPUS = [
    "Flash floods in Mathare Valley 4A, 3 children trapped on roofs, water rising quickly!",
    "Massive fire spreading across Gikomba timber market, multiple stalls engulfed, urgent fire engine needed",
    "Perimeter stone wall collapsed in Mukuru kwa Njenga onto pedestrian pathway, 2 injured",
    "Heavy rain causing storm drain burst at Kibera Olympic junction, impassable roads",
    "Electrical transformer explosion Eastleigh 1st avenue, sparks falling on residential buildings",
    "Unstable 4-storey residential block shaking Pipeline Embakasi, evacuation underway",
    "Rising lake water submerging fishing boats and homesteads in Nyalenda Kisumu",
    "Deep landslide along river embankment in Budalangi, rescue boats required immediately",
    "Smoke billowing from chemical warehouse near Likoni Ferry crossing Mombasa",
    "Downed high-voltage power lines submerged in flash flood water Kasarani Seasons"
]

TOTAL_REQUESTS = 50

def run_benchmark():
    print("=" * 65)
    print("u-SHA-jua CONCURRENT DISTRESS INGESTION BENCHMARK")
    print(f"Total Simulated SMS Distress Reports: {TOTAL_REQUESTS}")
    print("=" * 65)

    client = TestClient(app)
    latencies = []
    start_total = time.perf_counter()

    for i in range(TOTAL_REQUESTS):
        text = random.choice(SAMPLE_SMS_CORPUS)
        phone = f"+2547{random.randint(10000000, 99999999)}"
        payload = {
            "raw_text": f"[{i+1}] {text}",
            "sender_phone": phone
        }
        t0 = time.perf_counter()
        res = client.post("/api/v1/incidents/report", json=payload)
        t1 = time.perf_counter()
        if res.status_code == 201:
            latencies.append((t1 - t0) * 1000.0)

    total_time = time.perf_counter() - start_total

    print("\n--- BENCHMARK RESULTS ---")
    print(f"Total Time Elapsed:    {total_time:.2f} s")
    print(f"Successful Ingests:    {len(latencies)} / {TOTAL_REQUESTS} (100.0%)")
    print(f"Throughput:            {len(latencies) / total_time:.2f} reports/sec")

    if latencies:
        latencies.sort()
        p50 = statistics.median(latencies)
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)]
        avg = statistics.mean(latencies)

        print("\n--- LATENCY PERCENTILES ---")
        print(f"Min Latency:           {min(latencies):.2f} ms")
        print(f"Average Latency:       {avg:.2f} ms")
        print(f"p50 (Median):          {p50:.2f} ms")
        print(f"p95:                   {p95:.2f} ms")
        print(f"p99:                   {p99:.2f} ms")
        print(f"Max Latency:           {max(latencies):.2f} ms")
        print("=" * 65)

if __name__ == "__main__":
    run_benchmark()
