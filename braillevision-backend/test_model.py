from ultralytics import YOLO

# Load your trained model
model = YOLO(r"C:\Users\prince\Desktop\BrailleVision_Hackathon\braillevision-backend\best.pt")

# See what it was trained to detect
print("=== MODEL INFO ===")
print("Classes:", model.names)
print("Number of classes:", len(model.names))
print("==================")