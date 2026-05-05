def calculate_severity(prediction: str, confidence: float) -> str:
    if prediction == "Normal":
        return "Informational"
    if confidence >= 85:
        return "High"
    if confidence >= 60:
        return "Medium"
    return "Low"
