import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load the .env file from the current directory
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    print("\nERROR: Could not find the MONGO_URI variable in your .env file.")
    print("Please ensure the .env file is in the same directory as this script.\n")
else:
    # Obscure the password for printing
    safe_uri_for_display = MONGO_URI.split('@')[0]
    print(f"\nAttempting to connect with URI starting with: {safe_uri_for_display}@...")
    
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        # The 'ping' command is a lightweight way to verify a connection.
        client.admin.command('ping')
        print("\n✅ SUCCESS: Connection to MongoDB Atlas was successful!")
        print("This means your connection string and network access are correct.\n")
    except Exception as e:
        print("\n❌ FAILURE: Could not connect to MongoDB Atlas.")
        print("This confirms the issue is either:")
        print("   1. An incorrect password or typo in your MONGO_URI.")
        print("   2. A local firewall/antivirus on your PC blocking the connection.")
        print("\nError details:")
        print(e)
        print()


