_ACTION_MAP = {
    "High": [
        "Immediately isolate host",
        "Block source IP",
        "Escalate to SOC",
    ],
    "Medium": [
        "Block suspicious IP",
        "Initiate investigation",
    ],
    "Low": [
        "Monitor traffic",
        "Flag for review",
    ],
    "Informational": [
        "No action required",
    ],
}


def recommended_actions(severity: str) -> list[str]:
    return list(_ACTION_MAP.get(severity, _ACTION_MAP["Informational"]))
