"""
Static configuration for all 12 stadium zones including capacity,
adjacency graph, and baseline occupancy by match phase.
"""

__all__ = ["ZONE_CONFIG", "VENUE_TOTAL_CAPACITY", "VENUE_ID", "VENUE_NAME"]

VENUE_TOTAL_CAPACITY: int = 50000
VENUE_ID: str = "stadium-01"
VENUE_NAME: str = "FlowState Stadium"

ZONE_CONFIG: dict[str, dict] = {
    "north-concourse": {
        "name": "North Concourse",
        "capacity": 8000,
        "adjacent": ["gate-a", "gate-b", "west-concourse", "east-concourse"],
        "type": "concourse",
        "baseline": {
            "pre_match": 15, "first_half": 20, "halftime": 85,
            "second_half": 25, "final_whistle": 70
        }
    },
    "south-concourse": {
        "name": "South Concourse",
        "capacity": 8000,
        "adjacent": ["gate-e", "gate-d", "west-concourse", "east-concourse"],
        "type": "concourse",
        "baseline": {
            "pre_match": 12, "first_half": 18, "halftime": 88,
            "second_half": 22, "final_whistle": 72
        }
    },
    "east-concourse": {
        "name": "East Concourse",
        "capacity": 5000,
        "adjacent": ["north-concourse", "south-concourse", "gate-c", "gate-d"],
        "type": "concourse",
        "baseline": {
            "pre_match": 20, "first_half": 15, "halftime": 65,
            "second_half": 20, "final_whistle": 60
        }
    },
    "west-concourse": {
        "name": "West Concourse",
        "capacity": 5000,
        "adjacent": ["north-concourse", "south-concourse", "gate-a", "gate-f"],
        "type": "concourse",
        "baseline": {
            "pre_match": 18, "first_half": 16, "halftime": 68,
            "second_half": 19, "final_whistle": 62
        }
    },
    "gate-a": {
        "name": "Gate A",
        "capacity": 3000,
        "adjacent": ["north-concourse", "west-concourse"],
        "type": "gate",
        "baseline": {
            "pre_match": 75, "first_half": 10, "halftime": 30,
            "second_half": 8, "final_whistle": 90
        }
    },
    "gate-b": {
        "name": "Gate B",
        "capacity": 3000,
        "adjacent": ["north-concourse", "east-concourse"],
        "type": "gate",
        "baseline": {
            "pre_match": 70, "first_half": 8, "halftime": 28,
            "second_half": 7, "final_whistle": 85
        }
    },
    "gate-c": {
        "name": "Gate C",
        "capacity": 3000,
        "adjacent": ["east-concourse"],
        "type": "gate",
        "baseline": {
            "pre_match": 40, "first_half": 5, "halftime": 20,
            "second_half": 5, "final_whistle": 75
        }
    },
    "gate-d": {
        "name": "Gate D",
        "capacity": 3000,
        "adjacent": ["south-concourse", "east-concourse"],
        "type": "gate",
        "baseline": {
            "pre_match": 45, "first_half": 6, "halftime": 22,
            "second_half": 6, "final_whistle": 80
        }
    },
    "gate-e": {
        "name": "Gate E",
        "capacity": 3000,
        "adjacent": ["south-concourse"],
        "type": "gate",
        "baseline": {
            "pre_match": 50, "first_half": 7, "halftime": 25,
            "second_half": 7, "final_whistle": 82
        }
    },
    "gate-f": {
        "name": "Gate F",
        "capacity": 3000,
        "adjacent": ["west-concourse", "south-concourse"],
        "type": "gate",
        "baseline": {
            "pre_match": 35, "first_half": 5, "halftime": 18,
            "second_half": 5, "final_whistle": 70
        }
    },
    "field-level": {
        "name": "Field Level",
        "capacity": 10000,
        "adjacent": ["north-concourse", "south-concourse", "east-concourse", "west-concourse"],
        "type": "seating",
        "baseline": {
            "pre_match": 30, "first_half": 92, "halftime": 45,
            "second_half": 94, "final_whistle": 20
        }
    },
    "upper-deck": {
        "name": "Upper Deck",
        "capacity": 15000,
        "adjacent": ["north-concourse", "south-concourse"],
        "type": "seating",
        "baseline": {
            "pre_match": 20, "first_half": 88, "halftime": 40,
            "second_half": 90, "final_whistle": 15
        }
    }
}


def validate_zone_config() -> None:
    """Validates zone configuration for consistency and correctness."""
    required_phases = ["pre_match", "first_half", "halftime", "second_half", "final_whistle"]
    
    for zone_id, config in ZONE_CONFIG.items():
        if "capacity" not in config or config["capacity"] <= 0:
            raise ValueError(f"Invalid capacity for zone: {zone_id}")
            
        if "adjacent" not in config:
            raise ValueError(f"Missing adjacency list for zone: {zone_id}")
            
        if not isinstance(config["adjacent"], list):
            raise ValueError(f"Adjacency must be a list for zone: {zone_id}")
            
        for adj in config["adjacent"]:
            if adj not in ZONE_CONFIG:
                raise ValueError(f"Zone '{zone_id}' references undefined adjacent zone: '{adj}'")
                
        if "baseline" not in config:
            raise ValueError(f"Missing baseline for zone: {zone_id}")
            
        for phase in required_phases:
            if phase not in config["baseline"]:
                raise ValueError(f"Missing baseline phase '{phase}' in zone: {zone_id}")


# Run validation immediately upon module import
validate_zone_config()
