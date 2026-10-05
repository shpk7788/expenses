"""Builds stores.js: a compact, deduplicated brand list for instant search.
Source: OpenStreetMap name-suggestion-index (brands relevant to India) + a curated
list of Indian chains, apps and services. Usage: python3 build_stores.py path/to/nsi.json
"""
import json, re, sys

CURATED = {
  "Food delivery": "Swiggy, Zomato, EatSure, Magicpin",
  "Groceries": "Blinkit, Zepto, Swiggy Instamart, BigBasket, BB Daily, JioMart, Amazon Fresh, Flipkart Minutes, Country Delight, Licious, FreshToHome, Milkbasket, Ratnadeep, Spencer's, More Supermarket, Nilgiris, Namdhari's Fresh, Simpli Namdhari's, Foodhall, Star Market, Nature's Basket, Reliance Smart, Smart Bazaar, DMart, Big Bazaar, Lulu Hypermarket, Star Bazaar, Vishal Mega Mart",
  "Shopping": "Amazon, Flipkart, Myntra, Ajio, Meesho, Nykaa, Nykaa Fashion, Tata CLiQ, Croma, Vijay Sales, Reliance Trends, Max Fashion, H&M, Uniqlo, Zara, Decathlon, IKEA, Pepperfry, Urban Ladder, Lenskart, FirstCry, Tata Neu, Snapdeal, Purplle, Mamaearth, boAt, Apple Store, Samsung Store, Bata, Puma, Nike, Adidas",
  "Restaurant": "Barbeque Nation, Mainland China, Absolute Barbecues, Truffles, Meghana Foods, Paradise Biryani, Behrouz Biryani, Saravana Bhavan, Adyar Ananda Bhavan (A2B), Haldiram's, Bikanervala, Sagar Ratna, MTR, Rameshwaram Cafe, Vidyarthi Bhavan, Social, Smoke House Deli, Theobroma, Mad Over Donuts, Krispy Kreme, Dunkin', California Burrito, Taco Bell, Faasos, Oven Story Pizza, La Pino'z Pizza, Biryani By Kilo, Wow! Momo, Burger Singh, Goli Vada Pav, Jumboking, Box8, Rolls Mania, Kailash Parbat",
  "Fast food": "McDonald's, KFC, Domino's, Pizza Hut, Burger King, Subway, Taco Bell, Wendy's, Popeyes",
  "Cafe": "Starbucks, Third Wave Coffee, Blue Tokai, Cafe Coffee Day, Chaayos, Chai Point, Barista, Costa Coffee, Tim Hortons, Araku Coffee, Subko, Chai Kings, Chai Sutta Bar",
  "Dessert": "Baskin Robbins, Naturals Ice Cream, Corner House, Keventers, Hangyo, Kwality Walls, Amul, Polar Bear, Cream Stone, Belgian Waffle",
  "Fuel": "Indian Oil, HP, Bharat Petroleum, Shell, Nayara Energy, Jio-bp",
  "Pharmacy": "Apollo Pharmacy, MedPlus, Wellness Forever, Netmeds, PharmEasy, Tata 1mg, Truemeds, Frank Ross, Guardian Pharmacy",
  "Health": "Apollo Hospitals, Manipal Hospitals, Fortis, Max Healthcare, Practo, Cult.fit, Thyrocare, Dr Lal PathLabs, Metropolis, Healthians",
  "Transport": "Uber, Ola, Rapido, Namma Yatri, BluSmart, Auto rickshaw, IRCTC, Indian Railways, RedBus, Namma Metro, Delhi Metro, Mumbai Metro, Chennai Metro, Hyderabad Metro, FASTag, Zoomcar, Yulu, Bounce, Parking",
  "Travel": "MakeMyTrip, Goibibo, Cleartrip, EaseMyTrip, Ixigo, Agoda, Booking.com, Airbnb, OYO, IndiGo, Air India, Akasa Air, SpiceJet, Air India Express",
  "Entertainment": "BookMyShow, District, PVR INOX, Cinepolis, Netflix, Amazon Prime, JioHotstar, Spotify, YouTube Premium, Apple Music, SonyLIV, Zee5, Audible, Kindle, Steam, PlayStation Store, Google Play",
  "Bills & utilities": "Airtel, Jio, Vi (Vodafone Idea), BSNL, ACT Fibernet, Hathway, Tata Play, BESCOM, Tata Power, Adani Electricity, MSEDCL, TNEB, BSES, Indane Gas, HP Gas, Bharat Gas, Water Bill, Electricity Bill",
  "Services": "Urban Company, Dunzo, Porter, NoBroker, Housejoy, Apollo 24|7, Google One, iCloud, Microsoft 365, ChatGPT, Claude",
  "Personal care": "Naturals Salon, Lakme Salon, Green Trends, Jawed Habib, Toni & Guy, Enrich Salon, YLG Salon, Bodycraft",
  "Department store": "Shoppers Stop, Lifestyle, Westside, Pantaloons, Zudio, Central, Reliance Trends, V-Mart",
}

LABELS = {"fast_food": "Fast food", "fuel": "Fuel", "ice_cream": "Dessert", "car_rental": "Travel",
          "fitness_centre": "Fitness", "supermarket": "Groceries", "convenience": "Groceries",
          "clothes": "Clothing", "jewelry": "Jewellery", "mobile_phone": "Mobile store"}
AMENITY = {"fast_food","restaurant","cafe","fuel","pharmacy","cinema","ice_cream","bar","pub","car_rental",
           "clinic","hospital","dentist","food_court","charging_station","car_wash","bicycle_rental","doctors","veterinary"}
SKIP_SHOP = {"car_repair","truck_repair","tyres","car_parts","agrarian","trade","wholesale","vacant","fuel"}
INDIA = {"in"}; NEAR = {"001","142","034"}

def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower())
def label(v): return LABELS.get(v, v.replace("_", " ").capitalize())

out = {}  # norm -> [name, category, india(1/0)]
for cat, names in CURATED.items():
    for n in [x.strip() for x in names.split(",") if x.strip()]:
        out.setdefault(norm(n), [n, cat, 1])

nsi = json.load(open(sys.argv[1]))["nsi"]
for k, v in nsi.items():
    p = k.split("/")
    if p[0] != "brands": continue
    key, val = p[1], p[2]
    if key == "amenity" and val not in AMENITY: continue
    if key == "shop" and val in SKIP_SHOP: continue
    if key == "tourism" and val not in ("hotel", "motel", "hostel", "guest_house"): continue
    if key == "leisure" and val not in ("fitness_centre", "sports_centre", "bowling_alley"): continue
    if key not in ("shop", "amenity", "leisure", "tourism", "healthcare"): continue
    for it in v["items"]:
        ls = it.get("locationSet", {})
        inc = {str(x) for x in ls.get("include", [])}
        india = bool(inc & INDIA or any(x.startswith("in-") for x in inc))
        if not (india or inc & NEAR): continue
        name = it.get("displayName") or it["tags"].get("brand") or it["tags"].get("name") or ""
        name = re.sub(r"\s*\((?!HP|BPCL|A2B)[^)]*\)$", "", name).strip()
        n = norm(name)
        if len(n) < 2: continue
        if n in out:
            if india: out[n][2] = 1
            continue
        out[n] = [name, label(val), 1 if india else 0]

# Drop "X Pizza"/"X Cafe"/... when plain "X" exists, so each brand shows once
GENERIC = ("pizza","cafe","coffee","restaurant","store","stores","supermarket","hypermarket","pharmacy","india","foods","outlet")
for k in list(out):
    for g in GENERIC:
        if k.endswith(g) and k[:-len(g)] in out and len(k) > len(g) + 1:
            base = out[k[:-len(g)]]; base[2] = max(base[2], out[k][2]); del out[k]; break
rows = sorted(out.values(), key=lambda r: (-r[2], r[0].lower()))
js = "// Generated by tools/build_stores.py — brand list for instant store search.\nwindow.STORES=" + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(sys.argv[2] if len(sys.argv) > 2 else "stores.js", "w").write(js)
print(len(rows), "stores,", sum(r[2] for r in rows), "India-specific,", len(js)//1024, "KB")
