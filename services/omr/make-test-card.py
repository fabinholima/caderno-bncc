"""Generate a synthetic ten-question card for local OMR integration tests."""
import sys
import cv2
import numpy as np

image = np.full((1200, 900, 3), 255, np.uint8)
payload = "CBS1:00000000-0000-4000-8000-000000000001:synthetic-test"
qr = cv2.QRCodeEncoder_create().encode(payload)
qr = cv2.resize(qr, (180, 180), interpolation=cv2.INTER_NEAREST)
image[20:200, 650:830] = cv2.cvtColor(qr, cv2.COLOR_GRAY2BGR)
for number in range(10):
    y = 350 + number * 65
    cv2.putText(image, str(number + 1), (100, y + 7), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    for label in range(5):
        x = 200 + label * 50
        cv2.circle(image, (x, y), 14, (0, 0, 0), 2)
        if label == number % 5:
            cv2.circle(image, (x, y), 10, (0, 0, 0), -1)
if not cv2.imwrite(sys.argv[1], image):
    raise RuntimeError("Could not save the test image")
