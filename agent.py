from tools import *

class TripPlannerAgent:

    def __init__(self, state):
        self.state = state

    def run(self):
        print("\n========================")
        print("AGENT THINKING...")
        print("========================")

        # ==========================
        # GET COORDINATES
        # ==========================
        print("\nGetting coordinates...")
        (
            self.state.latitude,
            self.state.longitude
        ) = geocode_city(
            self.state.destination
        )

        print("Latitude:", self.state.latitude)
        print("Longitude:", self.state.longitude)

        if self.state.latitude is None or self.state.longitude is None:
            return """
ERROR

Could not find location coordinates.

Please try another city.
"""

        # ==========================
        # WEATHER FORECAST
        # ==========================
        print("\nFetching weather forecast...")
        self.state.weather_forecast = weather_forecast_tool(
            self.state.latitude,
            self.state.longitude
        )
        # Use first day forecast as current/summary condition
        if self.state.weather_forecast and "\n" in self.state.weather_forecast:
            self.state.weather = self.state.weather_forecast.split("\n")[0]
        else:
            self.state.weather = self.state.weather_forecast or "Normal conditions"
        print("✓ Weather forecast collected")

        # ==========================
        # ATTRACTIONS
        # ==========================
        print("\nFinding attractions...")
        self.state.attractions = attraction_tool(
            self.state.latitude,
            self.state.longitude
        )
        print("✓ Attractions collected")

        # ==========================
        # WEB SEARCH FOR HOTELS
        # ==========================
        print("\nSearching web for booking options...")
        self.state.web_search_results = web_search_tool(
            self.state.destination,
            self.state.budget
        )
        print("✓ Web search completed")

        # ==========================
        # HOTELS
        # ==========================
        print("\nFinding hotels...")
        self.state.hotels = hotel_tool(
            self.state.latitude,
            self.state.longitude
        )

        if self.state.hotels == "NO_HOTELS_FOUND":
            return """
ERROR

No hotels found near this destination.

Try another city.
"""
        print("✓ Hotels collected")

        # ==========================
        # RESTAURANTS
        # ==========================
        print("\nFinding restaurants...")
        self.state.restaurants = restaurant_tool(
            self.state.latitude,
            self.state.longitude
        )
        print("✓ Restaurants collected")

        # ==========================
        # TRAVEL PROFILE
        # ==========================
        print("\nCreating traveler profile...")
        self.state.travel_profile = travel_profile_tool(
            self.state.destination,
            self.state.days,
            self.state.budget,
            self.state.travelers,
            self.state.style,
            self.state.interests
        )
        print("✓ Travel profile created")

        # ==========================
        # HOTEL SELECTION
        # ==========================
        print("\nSelecting hotel...")
        self.state.selected_hotel = hotel_selection_tool(
            self.state.hotels + "\n\nWEB SEARCH RESULTS:\n" + self.state.web_search_results,
            self.state.budget
        )

        if "NO_HOTELS_FOUND" in self.state.selected_hotel:
            return """
ERROR

Could not select a valid hotel.
"""
        print("✓ Hotel selected")

        # ==========================
        # PACKING ASSISTANT
        # ==========================
        print("\nCreating packing checklist...")
        self.state.packing_list = packing_assistant_tool(
            self.state.destination,
            self.state.weather_forecast,
            self.state.days,
            self.state.interests
        )
        print("✓ Packing checklist created")

        # ==========================
        # ITINERARY
        # ==========================
        print("\nCreating itinerary...")
        self.state.itinerary = itinerary_tool(self.state)
        print("✓ Itinerary created")

        return self.state.itinerary