# First, you'll need to install the necessary libraries.
# Run this command in your terminal:
# pip install requests fuzzywuzzy python-levenshtein

import requests
import json
import time
import os
import csv
from datetime import datetime, timedelta
from fuzzywuzzy import process, fuzz

def get_all_card_names(cache_file="scryfall_card_names.json", cache_duration_hours=24):
    """
    Fetches a list of all unique Magic: The Gathering card names from Scryfall's API.
    Caches the list to a file to avoid repeated downloads.

    Args:
        cache_file (str): The name of the file to cache the data in.
        cache_duration_hours (int): The number of hours after which the cache expires.

    Returns:
        A list of strings, where each string is a unique card name.
    """
    if os.path.exists(cache_file):
        # Check if the cache file is still fresh
        file_mod_time = datetime.fromtimestamp(os.path.getmtime(cache_file))
        if datetime.now() - file_mod_time < timedelta(hours=cache_duration_hours):
            print(f"Loading card name catalog from cache: '{cache_file}'")
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get("data", [])

    url = "https://api.scryfall.com/catalog/card-names"
    print("Downloading fresh card name catalog from Scryfall...")
    
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes
        data = response.json()
        
        # Scryfall recommends waiting between requests. We'll wait a moment.
        time.sleep(0.1)
        
        # Save the data to the cache file
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(data, f)
        
        return data.get("data", [])
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching card names: {e}")
        return []

def fuzzy_match_card(misspelled_name, card_names, score_threshold=80):
    """
    Uses fuzzy string matching to find the best-matched card name.

    Args:
        misspelled_name (str): The name to be corrected.
        card_names (list): The list of all valid card names.
        score_threshold (int): The minimum fuzzy score to consider a match.

    Returns:
        A tuple containing the best-matched name and its score, or (None, None)
        if no match meets the threshold.
    """
    # The process.extractOne function finds the single best match.
    # We use the token_sort_ratio for more robust matching of words in a different order.
    # The score_cutoff prevents us from returning very poor matches.
    match = process.extractOne(misspelled_name, card_names, scorer=fuzz.token_sort_ratio, score_cutoff=score_threshold)
    
    if match:
        # match is a tuple like ('Correct Card Name', score)
        return match
    else:
        return (None, None)

def main():
    """
    Main function to run the spell-checking process.
    """
    # Your list of potentially misspelled card names
    misspelled_list = [
        "Optimus Prime, Hero // Optimus Prime, Autobot Leader",
        "Yarok, the Desecrated",
        "Bristly Bill, Spine Sower",
        "Odric, Lunarch Marshall",
        "Laelia, the Blade Reforged",
        "Eligeth, Crossroads Augur",
        "Esior, Wardwing Familiar",
        "Azusa, Lost but Seeking",
        "Sheoldred // The True Scriptures",
        "Phelia, Exuberant Shepherd",
        "Aragorn the Uniter",
        "Jodah the Unifier",
        "Atla Palani, Nest Tender",
        "Burakos, Party Leader",
        "Yidris, Maelstrom Wielder",
        "Kefka, Court Mage // Kefka, Ruler of Ruin",
        "Helga, Skittish Seer",
        "The Howling Abomination",
        "Squall, Seed Mercenary ",
        "Greymond, Avacyn's Stalwart",
        "Morophon, The Boundless",
        "Omnath Locus of Rage",
        "Breya, Etherium Shaper",
        "Marchesa, the Black Rose",
        "Felothar the Steadfast",
        "Imotekh the Stormlord",
        "Bilbo, Birthday Celebrant",
        "Sen Triplets",
        "Pantlaza, Sun-Favored",
        "Eriette of the Charmed Apple",
        "Éowyn, Shieldmaiden",
        "Deadpool, Trading Card",
        "Lonis, Cryptozoologist",
        "Chishiro, the Shattered Blade",
        "Raphael, Fiendish Savior",
        "Shorikai, Genesis Engine",
        "Xyris, the Writhing Storm",
        "Zedruu the Greathearted",
        "Teval, the Balanced Scale",
        "Y'shtola, Night's Blessed",
        "Inspirit, Flagship Vessel",
        "Bria, Riptide Rogue",
        "Teysa Karlov",
        "Lightning, Army of One",
        "Henzie \"Toolbox\" Torre",
        "Nelly Borca, Impulsive Accuser",
        "Tidus, Yuna's Guardian",
        "Cloud, Ex-SOLDIER",
        "The Necrobloom",
        "Zimone, Mystery Unraveler",
        "Sally Sparrow",
        "Valgavoth, Harrower of Souls",
        "Hakbal of the Surging Soul",
        "Sorin of House Markov // Sorin, Ravenous Neonate",
        "Giada, Font of Hope",
        "Teysa, Opulent Oligarch",
        "The Infamous Cruelclaw",
        "Dihada, Binder of Wills",
        "Arthur, Marigold Knight",
        "Ellivere of the Wild Court",
        "Rocco Street Chef",
        "Ms. Bumbleflower",
        "G'raha Tia, Scion Reborn",
        "Hashaton, Scarab's Fist",
        "Miirym, Sentinel Wyrm",
        "Dogmeat, Ever Loyal",
        "Lord of the Nazgûl",
        "Aminatou, Veil Piercer",
        "Temmet, Naktamun's Will",
    ]

# Get the list of all valid card names, either from cache or a new download
    all_card_names = get_all_card_names()
    
    if not all_card_names:
        print("Could not retrieve the card list. Exiting.")
        return

    print("\n--- Starting Spell Check ---")
    print("-" * 25)
    
    results = []
    for name in misspelled_list:
        matched_name, score = fuzzy_match_card(name, all_card_names)
        
        corrected_name = matched_name if matched_name else "No good match found"
        final_score = score if score else ""
        
        results.append((name, corrected_name, final_score))

        if matched_name:
            print(f"-> Suggested correction: '{matched_name}' (Score: {score})")
        else:
            print("-> No good match found.")
        print("-" * 25)

    # Write the results to a CSV file
    csv_file_name = "spell_check_results.csv"
    with open(csv_file_name, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["original_name", "corrected_name", "score"]) # Write header
        writer.writerows(results)
    
    print("\nSpell check complete.")
    print(f"Results saved to '{csv_file_name}'.")

if __name__ == "__main__":
    main()