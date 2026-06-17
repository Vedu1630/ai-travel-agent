import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from state import AgentState
from agent import TripPlannerAgent

def main():

    destination = input(
        "Destination: "
    )

    days = int(
        input("Days: ")
    )

    budget = int(
        input("Budget (INR): ")
    )

    state = AgentState()

    state.destination = destination
    state.days = days
    state.budget = budget

    agent = TripPlannerAgent(state)

    result = agent.run()

    print("\n")
    print("=" * 60)
    print("FINAL TRIP PLAN")
    print("=" * 60)
    print(result)

if __name__ == "__main__":
    main()