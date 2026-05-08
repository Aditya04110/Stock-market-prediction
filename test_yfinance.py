import yfinance as yf
from datetime import datetime, timedelta

symbol = "RELIANCE.NS"
print(f"Testing yfinance for {symbol}...\n")

try:
    # Test 1: Quick fetch
    ticker = yf.Ticker(symbol)
    print(f"✓ Ticker object created for {symbol}")
    
    # Test 2: Get last 5 days
    end_date = datetime.now()
    start_date = end_date - timedelta(days=5)
    
    print(f"Fetching data from {start_date.date()} to {end_date.date()}...")
    
    data = ticker.history(start=start_date, end=end_date)
    
    if data.empty:
        print("❌ No data returned!")
    else:
        print(f"✓ Got {len(data)} records")
        print("\nLast 3 rows:")
        print(data.tail(3))
        print(f"\nLatest Close Price: {data['Close'].iloc[-1]:.2f}")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
