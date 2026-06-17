import requests
from duckduckgo_search import DDGS

from config import (
    client,
    MODEL,
    GEOAPIFY_API_KEY,
    WEATHER_API_KEY
)

# =====================================================
# GEOCODING TOOL
# =====================================================

def geocode_city(city):

    try:

        url = (
            "https://api.geoapify.com/v1/geocode/search"
        )

        params = {
            "text": city,
            "format": "json",
            "limit": 1,
            "apiKey": GEOAPIFY_API_KEY
        }

        response = requests.get(
            url,
            params=params
        )

        print("\nGEOCODE STATUS:")
        print(response.status_code)

        data = response.json()

        results = data.get(
            "results",
            []
        )

        if len(results) == 0:
            return None, None

        lat = results[0]["lat"]
        lon = results[0]["lon"]

        return lat, lon

    except Exception as e:

        print(
            "Geocode Error:",
            e
        )

        return None, None


# =====================================================
# HOTEL TOOL
# =====================================================

def hotel_tool(lat, lon):

    try:

        url = (
            "https://api.geoapify.com/v2/places"
        )

        params = {
            "categories":
            "accommodation.hotel",

            "filter":
            f"circle:{lon},{lat},30000",

            "limit":
            20,

            "apiKey":
            GEOAPIFY_API_KEY
        }

        response = requests.get(
            url,
            params=params
        )

        data = response.json()

        print("\nHOTEL API RESPONSE:")

        hotels = []

        for item in data.get(
            "features",
            []
        ):

            props = item.get(
                "properties",
                {}
            )

            name = props.get(
                "name"
            )

            address = props.get(
                "formatted"
            )

            if name:

                hotels.append(
                    f"""
Hotel Name:
{name}

Address:
{address}
"""
                )

        if not hotels:

            return "NO_HOTELS_FOUND"

        return "\n\n".join(hotels)

    except Exception as e:

        print(e)

        return "NO_HOTELS_FOUND"


# =====================================================
# ATTRACTIONS TOOL
# =====================================================

def attraction_tool(lat, lon):

    try:

        url = (
            "https://api.geoapify.com/v2/places"
        )

        params = {
            "categories":
            "tourism.sights",

            "filter":
            f"circle:{lon},{lat},50000",

            "limit":
            20,

            "apiKey":
            GEOAPIFY_API_KEY
        }

        response = requests.get(
            url,
            params=params
        )

        data = response.json()

        attractions = []

        for item in data.get(
            "features",
            []
        ):

            props = item.get(
                "properties",
                {}
            )

            name = props.get(
                "name"
            )

            if name:
                attractions.append(f"- {name}")

        if not attractions:

            return "No attractions found"

        return "\n".join(attractions)

    except Exception as e:

        print(e)

        return "No attractions found"


# =====================================================
# RESTAURANT TOOL
# =====================================================

def restaurant_tool(lat, lon):

    try:

        url = (
            "https://api.geoapify.com/v2/places"
        )

        params = {
            "categories":
            "catering.restaurant",

            "filter":
            f"circle:{lon},{lat},30000",

            "limit":
            20,

            "apiKey":
            GEOAPIFY_API_KEY
        }

        response = requests.get(
            url,
            params=params
        )

        data = response.json()

        restaurants = []

        for item in data.get(
            "features",
            []
        ):

            props = item.get(
                "properties",
                {}
            )

            name = props.get(
                "name"
            )

            if name:
                restaurants.append(f"- {name}")

        if not restaurants:

            return "No restaurants found"

        return "\n".join(restaurants)

    except Exception as e:

        print(e)

        return "No restaurants found"


# =====================================================
# TRAVEL PROFILE TOOL
# =====================================================

def travel_profile_tool(
    destination,
    days,
    budget,
    travelers=1,
    style="comfort",
    interests=""
):

    prompt = f"""
Destination: {destination}
Days: {days}
Budget: {budget} INR
Number of Travelers: {travelers}
Requested Style: {style}
Interests: {interests}

Determine:
1. Traveler Profile & Persona
2. Daily Budget breakdown per traveler
3. Recommended Travel Style matching their preferences

Keep response concise.
"""

    response = (
        client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
    )

    return (
        response
        .choices[0]
        .message
        .content
    )


# =====================================================
# HOTEL SELECTION TOOL
# =====================================================

def hotel_selection_tool(
    hotels,
    budget
):

    if hotels == "NO_HOTELS_FOUND":

        return "NO_HOTELS_FOUND"

    prompt = f"""
IMPORTANT

Choose ONLY from the hotels below.

DO NOT invent hotels.

Budget:
{budget}

Hotels:

{hotels}

Return:

Hotel Name

Address

Reason
"""

    response = (
        client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
    )

    return (
        response
        .choices[0]
        .message
        .content
    )


# =====================================================
# ITINERARY TOOL
# =====================================================

def itinerary_tool(state):

    prompt = f"""
IMPORTANT RULES

1. Use ONLY the hotel below.

2. NEVER invent hotels.

3. NEVER invent hotel addresses.

4. Night stay for ALL days
must use this hotel:

{state.selected_hotel}

5. Total trip cost MUST stay
within:

{state.budget} INR

Destination:
{state.destination}

Origin City:
{state.origin}

Dates:
From {state.start_date} to {state.end_date} ({state.days} days, {state.travelers} traveler(s))

Travel Style:
{state.style} (Target profile: {state.travel_profile})

User Interests:
{state.interests}

Attractions:
{state.attractions}

Restaurants:
{state.restaurants}

Create a realistic itinerary.

For EVERY DAY include:

Breakfast

Morning Activity

Lunch

Afternoon Activity

Dinner

Night Stay

Also include:

Estimated Total Cost (itemized by transport, accommodation, food, activities, local transport, misc)

Transport Advice (from {state.origin} to {state.destination} and local options)

Travel Tips
"""

    response = (
        client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
    )

    return (
        response
        .choices[0]
        .message
        .content
    )

# =====================================================
# WEATHER FORECAST TOOL
# =====================================================

def weather_forecast_tool(lat, lon):
    try:
        url = "https://api.openweathermap.org/data/2.5/forecast"
        params = {
            "lat": lat,
            "lon": lon,
            "appid": WEATHER_API_KEY,
            "units": "metric"
        }
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            forecasts = data.get("list", [])
            summary = {}
            for item in forecasts:
                dt_txt = item.get("dt_txt", "")
                if not dt_txt:
                    continue
                date_str = dt_txt.split(" ")[0]
                temp = item["main"]["temp"]
                desc = item["weather"][0]["description"]
                if date_str not in summary:
                    summary[date_str] = {"temps": [], "conditions": []}
                summary[date_str]["temps"].append(temp)
                summary[date_str]["conditions"].append(desc)
            
            result_lines = []
            for date in sorted(summary.keys())[:5]:
                info = summary[date]
                min_temp = min(info["temps"])
                max_temp = max(info["temps"])
                cond = max(set(info["conditions"]), key=info["conditions"].count)
                result_lines.append(f"{date}: Min {min_temp:.1f}°C, Max {max_temp:.1f}°C, Condition: {cond.capitalize()}")
            return "\n".join(result_lines)
        return "Weather forecast not available."
    except Exception as e:
        print(f"Weather Forecast Error: {e}")
        return "Weather forecast not available."

# =====================================================
# PACKING ASSISTANT TOOL
# =====================================================

def packing_assistant_tool(destination, weather_summary, days, interests):
    prompt = f"""
Destination: {destination}
Trip Duration: {days} days
Interests: {interests}
Weather Forecast Summary:
{weather_summary}

Generate a categorized packing checklist for the traveler. 
Categories should be relevant (e.g., Clothing, Toiletries, Electronics, Documents, Activity-specific gear based on interests).
Return the output in clean Markdown bullet points. Each item should start with a checkable format like "- [ ] Item Name".
Keep it concise and relevant.
"""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        print("Packing Assistant Tool Error:", e)
        return "- [ ] Toiletries\n- [ ] ID & Travel Documents\n- [ ] Phone Charger\n- [ ] Suitable Clothing"


# =====================================================
# WEB SEARCH TOOL
# =====================================================

def web_search_tool(destination, budget):
    queries = [
        f"best hotels in {destination} under {budget} INR makemytrip booking.com prices",
        f"hotels in {destination} booking.com",
        f"{destination} hotels"
    ]
    for query in queries:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=5))
            if results:
                search_text = []
                for r in results:
                    search_text.append(f"Title: {r.get('title')}\nSnippet: {r.get('body')}")
                return "\n\n".join(search_text)
        except Exception as e:
            print(f"Web Search Error for query '{query}': {e}")
    return "No web search results found."