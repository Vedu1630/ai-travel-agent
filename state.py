class AgentState:

    def __init__(self):
        # User input fields
        self.origin = ""
        self.destination = ""
        self.start_date = ""
        self.end_date = ""
        self.days = 0
        self.budget = 0
        self.travelers = 1
        self.style = "comfort"  # budget, comfort, luxury
        self.interests = ""      # comma-separated interests

        # Geocode & API coordinates
        self.latitude = None
        self.longitude = None

        # Weather details
        self.weather = ""
        self.weather_forecast = ""

        # Places collected
        self.attractions = ""
        self.hotels = ""
        self.restaurants = ""

        # Web search
        self.web_search_results = ""

        # AI analysis & choices
        self.travel_profile = ""
        self.selected_hotel = ""
        self.packing_list = ""
        self.itinerary = ""