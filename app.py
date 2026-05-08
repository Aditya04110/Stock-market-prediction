"""
Stock Market Prediction - Backend API Server
Flask REST API with TensorFlow LSTM Model

Authors: Mansi Nagda (145), Aditya Chaudhari (111)
Guide: Mr. Dhanraj Jadhav
"""
from typing import Optional
from flask import request, redirect, session, url_for
from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
from flask import request, jsonify
import yfinance as yf
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import io
import base64
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import json
import os
import threading
import requests
import firebase_admin # pyright: ignore[reportMissingImports]
from firebase_admin import credentials, auth # pyright: ignore[reportMissingImports]

# Initialize Firebase Admin SDK (only once)
if not firebase_admin._apps:
    cred = credentials.Certificate("firebase_key.json")
    firebase_admin.initialize_app(cred)
    print("✅ Firebase Admin SDK initialized")
else:
    print("✅ Firebase Admin SDK already initialized")

from functools import wraps
from flask import request, jsonify

def firebase_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        id_token = request.headers.get("Authorization")

        if not id_token:
            return jsonify({"error": "Missing token"}), 401

        try:
            decoded_token = auth.verify_id_token(id_token)
            request.user = decoded_token # type: ignore
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401

        return f(*args, **kwargs)
    return decorated

# Import ML libraries
try:
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    import tensorflow as tf
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.callbacks import EarlyStopping
    print("✅ ML libraries loaded successfully")
except ImportError as e:
    print(f"⚠ Import error: {e}")
    print("Install: pip install tensorflow scikit-learn pandas numpy matplotlib flask flask-cors")

# Initialize Flask app
app = Flask(__name__, 
            template_folder='../frontend/templates',
            static_folder='../frontend/static')
app.secret_key = "stock-prediction-ai-super-secret-key-2026"
CORS(app)  # Enable CORS for all routes

# Global variables
MODEL = None
SCALER = MinMaxScaler(feature_range=(0, 1))
TRAINED_DATA = None
MODEL_PATH = 'models/lstm_stock_model.h5'
training_lock = threading.Lock()

# Ensure models directory exists
os.makedirs('models', exist_ok=True)
os.makedirs('data', exist_ok=True)

import time

def fetch_stock_data(symbol="TCS.NS"):
    """
    Fetch 1 year of stock data from Yahoo Finance and save to CSV
    """
    import pandas as pd
    
    symbol = symbol.strip().upper()
    csv_file = f"data/{symbol}_1year.csv"
    
    print(f"📊 Fetching 1-year data for {symbol}...")
    
    try:
        # Fetch 1 year of data
        ticker = yf.Ticker(symbol)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=1500)
        
        df = ticker.history(start=start_date, end=end_date)
        
        if df.empty:
            raise ValueError(f"No data available for {symbol}")
        
        # Reset index to make Date a column
        df.reset_index(inplace=True)
        
        # Save to CSV
        os.makedirs('data', exist_ok=True)
        df.to_csv(csv_file, index=False)
        
        print(f"✅ Fetched {len(df)} records for {symbol}")
        print(f"💾 Saved to {csv_file}")
        
        return df
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise ValueError(f"Failed to fetch data for {symbol}")




def get_live_price(symbol="TCS.NS"):
    """
    Fetch the latest stock price using yfinance
    """
    import time
    
    # Normalize symbol: strip whitespace and uppercase
    symbol = symbol.strip().upper()
    
    print(f"💹 Fetching live price for: {symbol}")
    
    try:
        # First attempt
        ticker = yf.Ticker(symbol)
        df = ticker.history(
            period="5d",
            threads=False,
            auto_adjust=True,
            progress=False
        )
        
        # If empty, wait and retry once
        if df.empty:
            print(f"⚠️  First attempt returned empty. Retrying in 2 seconds...")
            time.sleep(2)
            
            df = ticker.history(
                period="5d",
                threads=False,
                auto_adjust=True,
                progress=False
            )
        
        # If still empty, raise error
        if df.empty or df is None:
            print(f"❌ Unable to fetch live price for {symbol}")
            raise ValueError(f"Unable to fetch live price for {symbol}")
        
        # Get the latest closing price
        price = float(df['Close'].iloc[-1])
        
        print(f"✅ Live price for {symbol}: ₹{price:.2f}")
        
        return price
    
    except Exception as e:
        print(f"❌ Error fetching live price for {symbol}: {str(e)}")
        raise ValueError(f"Unable to fetch live price for {symbol}. Error: {str(e)}")

class StockPredictor:
    """Enhanced Stock Prediction System for API"""
    
    def __init__(self, lookback_period=90):
        self.lookback_period = lookback_period
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self.model: Sequential = None
        self.history = None
        self.train_data = None
        self.test_data = None
        self.original_data: Optional[pd.DataFrame] = None        
    
    def generate_sample_data(self, days=1200):
        """Generate sample stock data"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        dates = pd.date_range(start=start_date, end=end_date, freq='D')

        np.random.seed(42)
        base_price = 1500
        trend = np.linspace(0, 500, len(dates))
        noise = np.random.normal(0, 20, len(dates)).cumsum()
        close_prices = base_price + trend + noise

        open_prices = close_prices + np.random.normal(0, 5, len(dates))
        high_prices = np.maximum(open_prices, close_prices) + np.abs(np.random.normal(0, 10, len(dates)))
        low_prices = np.minimum(open_prices, close_prices) - np.abs(np.random.normal(0, 10, len(dates)))
        volumes = np.random.randint(1000000, 5000000, len(dates))

        df = pd.DataFrame({
            'Date': dates,
            'Open': open_prices,
            'High': high_prices,
            'Low': low_prices,
            'Close': close_prices,
            'Volume': volumes
        })

        self.original_data = df
        return df
    
    def load_csv_data(self, filepath):
        """Load data from CSV"""
        df = pd.read_csv(filepath)
        df['Date'] = pd.to_datetime(df['Date'])
        self.original_data = df
        return df
    
    def preprocess_data(self, data, train_split=0.8):
        """Preprocess data with MULTIPLE FEATURES: ['Open', 'High', 'Low', 'Close', 'Volume']"""
        features = ['Open', 'High', 'Low', 'Close', 'Volume']
        dataset = data[features].values
        split_index = int(len(dataset) * train_split)
        train_raw = dataset[:split_index]
        test_raw = dataset[split_index:]
        self.scaler.fit(train_raw)
        train_scaled = self.scaler.transform(train_raw)
        test_scaled = self.scaler.transform(test_raw)
        self.train_data = train_scaled
        self.test_data = test_scaled
        return True
    
    def create_sequences(self, data):
        if len(data) <= self.lookback_period:
            return np.array([]), np.array([])
        X, y = [], []
        for i in range(len(data) - self.lookback_period):
            X.append(data[i:(i + self.lookback_period)])
            y.append(data[i + self.lookback_period][3])  # Close price (index 3)
        return np.array(X), np.array(y)

    
    def build_model(self, units=100, dropout_rate=0.3):
        self.model = Sequential([
            LSTM(units=units, return_sequences=True, input_shape=(self.lookback_period, 5)),
            Dropout(dropout_rate),
            LSTM(units=units, return_sequences=False),
            Dropout(dropout_rate),
            Dense(50),
            Dense(1)
        ])
        self.model.compile(optimizer='adam', loss='mean_squared_error')
        return self.model
    
    def train_model(self, epochs=30, batch_size=32):
        """Train LSTM model"""
        if self.model is None:
            raise ValueError("Model is not built. Call build_model() first.")
        X_train, y_train = self.create_sequences(self.train_data)
        if X_train is None or len(X_train) == 0:
            raise ValueError("Not enough training data. Reduce lookback period or use more data.")
        early_stop = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)
        self.history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.1,
            callbacks=[early_stop],
            verbose=0
        )
        return self.history
    
    def evaluate_model(self):
        """Evaluate model on test data"""
        if self.model is None:
            raise ValueError("Model is not trained.")
        X_test, y_test = self.create_sequences(self.test_data)
        if X_test is None or len(X_test) == 0:
            raise ValueError("Not enough test data. Reduce lookback period or use more data.")
        predictions = self.model.predict(X_test, verbose=0)
        pred_full = np.zeros((len(predictions), 5))
        pred_full[:, 3] = predictions.flatten()
        predictions_inv = self.scaler.inverse_transform(pred_full)[:, 3]
        y_full = np.zeros((len(y_test), 5))
        y_full[:, 3] = y_test.flatten()
        y_test_actual = self.scaler.inverse_transform(y_full)[:, 3]
        mae = float(mean_absolute_error(y_test_actual, predictions_inv))
        rmse = float(np.sqrt(mean_squared_error(y_test_actual, predictions_inv)))
        mape = float(np.mean(np.abs((y_test_actual - predictions_inv) / y_test_actual)) * 100)
        return {
            'mae': mae,
            'rmse': rmse,
            'mape': mape,
            'predictions': predictions_inv.flatten().tolist(),
            'actual': y_test_actual.flatten().tolist()
        }
    
    def predict_future(self, n_days=7):
        if self.model is None:
            raise ValueError("Model is not trained.")
        if self.original_data is None or self.original_data.empty:
            raise ValueError("No data loaded for prediction.")
        data = self.original_data[['Open', 'High', 'Low', 'Close', 'Volume']].values
        scaled_data = self.scaler.transform(data)
        last_sequence = scaled_data[-self.lookback_period:]
        # Check shape before reshaping
        expected_size = self.lookback_period * 5
        if last_sequence.size != expected_size:
            raise ValueError(f"Input data shape mismatch: expected {expected_size} elements, got {last_sequence.size}. Please check data length and lookback period.")
        last_sequence = last_sequence.reshape(1, self.lookback_period, 5)
        predictions = []
        for _ in range(n_days):
            next_pred = self.model.predict(last_sequence, verbose=0)
            new_row = last_sequence[0, -1].copy()
            new_row[3] = next_pred[0][0]
            predictions.append(next_pred[0][0])
            last_sequence = np.append(
                last_sequence[:, 1:, :],
                new_row.reshape(1, 1, 5),
                axis=1
            )
        pred_full = np.zeros((len(predictions), 5))
        pred_full[:, 3] = predictions
        predictions_inv = self.scaler.inverse_transform(pred_full)[:, 3]
        return predictions_inv.tolist()
    
    def save_model(self, filepath):
        """Save trained model"""
        if self.model is None:
            raise ValueError("No model to save.")
        self.model.save(filepath)

    def load_model(self, filepath):
        """Load trained model"""
        self.model = load_model(filepath)


# Initialize predictor
predictor = StockPredictor(lookback_period=60)


# ============================================================================
# API ROUTES
# ============================================================================



@app.route('/')
def home():
    return redirect('/login')

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))

    return render_template('dashboard.html')


@app.route('/prediction')
def prediction():
    if 'user' not in session:
        return redirect(url_for('login'))

    return render_template('prediction.html')



def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Stock Prediction API is running',
        'version': '1.0.0',
        'model_loaded': MODEL is not None
    })

@app.route('/login', methods=['GET', 'POST'])
def login():

    if request.method == 'POST':

        username = request.form.get('username')
        password = request.form.get('password')

        # SIMPLE academic login
        if username == "admin" and password == "1234":

            session['user'] = username
            return redirect('/dashboard')

        return "Invalid Credentials"

    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/session-login', methods=['POST'])
def session_login():
    try:
        data = request.get_json()
        print("SESSION LOGIN DATA:", data)

        id_token = data.get("idToken")
        print("ID TOKEN RECEIVED:", id_token)

        decoded_token = auth.verify_id_token(id_token)
        print("DECODED TOKEN:", decoded_token)

        session['user'] = {
            "uid": decoded_token["uid"],
            "email": decoded_token.get("email")
        }

        print("SESSION CREATED SUCCESSFULLY")

        return jsonify({"success": True})

    except Exception as e:
        print("SESSION ERROR:", e)
        return jsonify({"error": "Failed to create session"}), 401



@app.route('/api/search-stock', methods=['GET'])
@firebase_required
def search_stock():
    """
    Search for Indian stock symbols using Yahoo Finance API
    Filters for .NS (NSE) and .BO (BSE) stocks
    Returns max 10 results
    """
    try:
        query = request.args.get('q', '').strip().upper()
        
        if not query or len(query) < 2:
            return jsonify({
                "success": False,
                "error": "Query must be at least 2 characters",
                "results": []
            }), 400
        
        print(f"\n🔍 [AUTOCOMPLETE] Searching for: '{query}'")
        
        # Call Yahoo Finance search API with proper headers
        url = "https://query1.finance.yahoo.com/v1/finance/search"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        params = {
            "q": query,
            "lang": "en-IN",
            "region": "IN"
        }
        
        print(f"📡 Calling Yahoo API: {url}")
        print(f"📋 Params: {params}")
        
        response = requests.get(url, params=params, headers=headers, timeout=8)
        response.raise_for_status()
        
        data = response.json()
        quotes = data.get('quotes', [])
        
        print(f"📊 Yahoo returned {len(quotes)} total results")
        
        if not quotes:
            print("⚠️  No results from Yahoo API")
            return jsonify({
                "success": True,
                "results": [],
                "query": query,
                "debug": "Yahoo returned empty results"
            })
        
        # Print first result for debugging
        if quotes:
            first = quotes[0]
            print(f"📌 First result: symbol={first.get('symbol')}, shortname={first.get('shortname')}")
        
        # Filter for Indian stocks (.NS or .BO) and extract required fields
        indian_stocks = []
        
        for quote in quotes:
            try:
                symbol = quote.get('symbol', '').strip().upper()
                
                if not symbol:
                    continue
                
                # Only include Indian stocks (.NS for NSE, .BO for BSE)
                if not (symbol.endswith('.NS') or symbol.endswith('.BO')):
                    print(f"  ⊘ Skipped {symbol} (not Indian exchange)")
                    continue
                
                # Extract company name with fallback
                short_name = quote.get('shortname', '').strip()
                long_name = quote.get('longname', '').strip()
                
                # Use shortname first, fallback to longname, then use symbol
                company_name = short_name or long_name or symbol
                
                indian_stocks.append({
                    'symbol': symbol,
                    'name': company_name
                })
                
                print(f"  ✅ Added: {symbol} - {company_name}")
                
                # Limit to 10 results
                if len(indian_stocks) >= 10:
                    print(f"✂️  Reached limit of 10 results")
                    break
            
            except Exception as e:
                print(f"  ⚠️  Error processing quote: {str(e)}")
                continue
        
        print(f"✅ Final result: {len(indian_stocks)} Indian stocks found\n")
        
        return jsonify({
            "success": True,
            "results": indian_stocks,
            "query": query,
            "count": len(indian_stocks)
        }), 200
    
    except requests.exceptions.Timeout as e:
        error_msg = f"Yahoo API timeout after 8 seconds for query '{query}'"
        print(f"⏱️  {error_msg}")
        return jsonify({
            "success": False,
            "error": "Search timeout - Yahoo Finance is slow",
            "results": []
        }), 408
    
    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection error to Yahoo API: {str(e)}"
        print(f"🌐 {error_msg}")
        return jsonify({
            "success": False,
            "error": "Network error - check internet connection",
            "results": []
        }), 503
    
    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP error from Yahoo API: {str(e)}"
        print(f"❌ {error_msg}")
        return jsonify({
            "success": False,
            "error": f"Yahoo API returned error: {response.status_code}",
            "results": []
        }), 502
    
    except requests.exceptions.RequestException as e:
        error_msg = f"Request exception: {str(e)}"
        print(f"❌ {error_msg}")
        return jsonify({
            "success": False,
            "error": "Search service unavailable",
            "results": []
        }), 500
    
    except ValueError as e:
        error_msg = f"JSON decode error from Yahoo: {str(e)}"
        print(f"📄 {error_msg}")
        return jsonify({
            "success": False,
            "error": "Invalid response from search service",
            "results": []
        }), 502
    
    except Exception as e:
        error_msg = f"Unexpected error in search_stock: {str(e)}"
        print(f"🔥 {error_msg}")
        return jsonify({
            "success": False,
            "error": "An unexpected error occurred",
            "results": []
        }), 500


@app.route('/api/generate-data', methods=['POST'])
def generate_data():
    """Generate sample stock data"""
    try:
        data = request.json or {}
        days = data.get('days', 1200)
        
        df = predictor.generate_sample_data(days=days)
        
        return jsonify({
            'success': True,
            'message': f'Generated {len(df)} records',
            'data': {
                'dates': df['Date'].dt.strftime('%Y-%m-%d').tolist(),
                'open': df['Open'].tolist(),
                'high': df['High'].tolist(),
                'low': df['Low'].tolist(),
                'close': df['Close'].tolist(),
                'volume': df['Volume'].tolist()
            },
            'stats': {
                'count': int(len(df)),
                'min_price': float(df['Close'].min()),
                'max_price': float(df['Close'].max()),
                'mean_price': float(df['Close'].mean()),
                'date_range': {
                    'start': df['Date'].min().strftime('%Y-%m-%d'),
                    'end': df['Date'].max().strftime('%Y-%m-%d')
                }
            }
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

#@app.route('/api/live-price', methods=['GET'])
#def live_price():
 #   symbol = request.args.get('symbol', 'TCS.BSE')
##   url = "https://www.alphavantage.co/query"
  #  params = {
   #     "function": "GLOBAL_QUOTE",
    ##   "apikey": API_KEY
  #

@app.route('/api/live-price', methods=['GET'])
def live_price():
    import time
    
    symbol = request.args.get('symbol', 'TCS.NS').strip().upper()
    print(f"💹 Fetching live price for: {symbol}")

    try:
        # First attempt to fetch data
        ticker = yf.Ticker(symbol)
        df = ticker.history(
            period="1mo",
            threads=False,
            auto_adjust=True,
            progress=False
        )

        # If empty, wait and retry once
        if df.empty:
            print(f"⚠️  First attempt returned empty. Retrying in 2 seconds...")
            time.sleep(2)
            
            df = ticker.history(
                period="1mo",
                threads=False,
                auto_adjust=True,
                progress=False
            )

        # If still empty, return error
        if df.empty:
            print(f"❌ Unable to fetch live price for {symbol}")
            return jsonify({
                "success": False,
                "error": f"Unable to fetch price data for {symbol}"
            }), 400

        # Get the latest closing price
        price = float(df['Close'].iloc[-1])
        
        print(f"✅ Live price for {symbol}: ₹{price:.2f}")

        return jsonify({
            "success": True,
            "symbol": symbol,
            "price": price
        })

    except Exception as e:
        print(f"❌ Error fetching live price for {symbol}: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Unable to fetch price for {symbol}. {str(e)}"
        }), 500


@app.route('/api/fetch-live-data', methods=['GET'])
def fetch_live_data():
    symbol = request.args.get('symbol', 'TCS.NS')
    print("SYMBOL RECEIVED:", symbol)
    
    try:
        data = fetch_stock_data(symbol)
        predictor.original_data = data

        data.to_csv("data/live_stock.csv", index=False)

        return jsonify({
            "status": "success",
            "rows": len(data),
            "symbol": symbol
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/upload-data', methods=['POST'])
def upload_data():
    """Upload CSV data"""
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Empty filename'}), 400
        
        # Save file
        filepath = f'data/{file.filename}'
        file.save(filepath)
        
        # Load data
        df = predictor.load_csv_data(filepath)
        
        return jsonify({
            'success': True,
            'message': f'Uploaded {len(df)} records',
            'data': {
                'dates': df['Date'].dt.strftime('%Y-%m-%d').tolist(),
                'close': df['Close'].tolist()
            },
            'stats': {
                'count': int(len(df)),
                'min_price': float(df['Close'].min()),
                'max_price': float(df['Close'].max())
            }
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/api/train', methods=['POST'])
@firebase_required
def train_model():
    """Train LSTM model"""
    try:
        global MODEL, TRAINED_DATA
        
        data = request.json or {}
        epochs = data.get('epochs', 30)
        batch_size = data.get('batch_size', 32)
        units = data.get('units', 50)
        dropout_rate = data.get('dropout_rate', 0.2)
        
        # Check if data exists
        if predictor.original_data is None or predictor.original_data.empty:
            return jsonify({
                'success': False,
                'error': 'No data loaded. Generate or upload data first.'
            }), 400
        
        # Preprocess
        predictor.preprocess_data(predictor.original_data)
        
        # Build model
        predictor.build_model(units=units, dropout_rate=dropout_rate)
        
        # Train
        history = predictor.train_model(epochs=epochs, batch_size=batch_size)
        
        # Save model
        predictor.save_model(MODEL_PATH)
        MODEL = predictor.model
        TRAINED_DATA = predictor
        
        return jsonify({
            'success': True,
            'message': 'Model trained successfully',
            'training_history': {
                'loss': [float(x) for x in history.history['loss']],
                'val_loss': [float(x) for x in history.history.get('val_loss', [])]
            },
            'config': {
                'epochs': epochs,
                'batch_size': batch_size,
                'units': units,
                'dropout_rate': dropout_rate
            }
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/evaluate', methods=['GET'])
@firebase_required
def evaluate_model():
    """Evaluate trained model"""
    try:
        if predictor.model is None:
            return jsonify({
                'success': False,
                'error': 'No model trained. Train a model first.'
            }), 400
        
        results = predictor.evaluate_model()
        
        return jsonify({
            'success': True,
            'metrics': {
                'mae': results['mae'],
                'rmse': results['rmse'],
                'mape': results['mape']
            },
            'predictions': results['predictions'],
            'actual': results['actual']
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/load-data', methods=['POST'])
@firebase_required
def load_data():
    """Load 1-year stock data from Yahoo Finance"""
    try:
        data = request.json or {}
        symbol = data.get('symbol', 'RELIANCE.NS').strip().upper()
        
        print(f"\n📥 Loading 1-year data for {symbol}")
        
        # Fetch data
        df = fetch_stock_data(symbol)
        
        # Store in predictor
        global predictor
        predictor.original_data = df
        
        return jsonify({
            'success': True,
            'symbol': symbol,
            'records': len(df),
            'date_range': {
                'start': df['Date'].min().strftime('%Y-%m-%d'),
                'end': df['Date'].max().strftime('%Y-%m-%d')
            }
        }), 200
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/predict-future', methods=['POST'])
@firebase_required
def predict_future():
    """Predict future stock prices using pre-loaded or fresh data"""
    try:
        data = request.json or {}
        symbol = data.get('symbol', 'RELIANCE.NS').strip().upper()
        n_days = data.get('days', 7)

        if not symbol:
            return jsonify({
                'success': False,
                'error': 'Stock symbol required'
            }), 400

        # Ensure symbol has .NS or .BO suffix
        if '.' not in symbol:
            symbol = symbol + '.NS'

        # Step 1: Always fetch fresh live stock data
        global predictor
        print(f"\U0001F4CA Fetching fresh data for {symbol}...")
        df = fetch_stock_data(symbol)
        # Step 2: Reset predictor instance
        predictor = StockPredictor(lookback_period=60)
        predictor.original_data = df

        with training_lock:
            # Preprocess data
            print("Preprocessing data...")
            predictor.preprocess_data(predictor.original_data)
            # Build fresh model (same architecture, no changes)
            print("Building model...")
            predictor.build_model(units=50, dropout_rate=0.2)
            # Train fresh model on current data
            print("Training model...")
            try:
                history = predictor.train_model(epochs=30, batch_size=32)
            except Exception as train_err:
                print(f"Training error: {train_err}")
                return jsonify({'success': False, 'error': f'Training error: {train_err}'}), 400
            # Make predictions
            print("Generating predictions...")
            try:
                predictions = predictor.predict_future(n_days=n_days)
            except Exception as pred_err:
                print(f"Prediction error: {pred_err}")
                return jsonify({'success': False, 'error': f'Prediction error: {pred_err}'}), 400

        if predictor.original_data is None or predictor.original_data.empty:
            return jsonify({
                'success': False,
                'error': 'No data loaded for prediction.'
            }), 400

        current_price = float(predictor.original_data['Close'].iloc[-1])
        last_date = predictor.original_data['Date'].max()
        future_dates = pd.date_range(start=last_date + timedelta(days=1), periods=n_days, freq='D')

        return jsonify({
            'success': True,
            'predictions': predictions,
            'dates': future_dates.strftime('%Y-%m-%d').tolist(),
            'current_price': current_price,
            'symbol': symbol,
            'summary': {
                'days': n_days,
                'first_prediction': predictions[0],
                'last_prediction': predictions[-1],
                'trend': 'upward' if predictions[-1] > predictions[0] else 'downward'
            }
        })
    except Exception as e:
        print(f"Prediction error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/model-info', methods=['GET'])
def model_info():
    """Get model information"""
    try:
        if predictor.model is None:
            return jsonify({
                'success': False,
                'error': 'No model trained'
            }), 400
        
        return jsonify({
            'success': True,
            'info': {
                'lookback_period': predictor.lookback_period,
                'model_architecture': 'Sequential LSTM',
                'layers': len(predictor.model.layers),
                'total_params': int(predictor.model.count_params()),
                'training_samples': len(predictor.train_data) if predictor.train_data is not None else 0,
                'testing_samples': len(predictor.test_data) if predictor.test_data is not None else 0
            }
        })
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/download-model', methods=['GET'])
def download_model():
    """Download trained model"""
    try:
        if not os.path.exists(MODEL_PATH):
            return jsonify({
                'success': False,
                'error': 'No trained model available'
            }), 404
        
        return send_file(MODEL_PATH, as_attachment=True, 
                        download_name='lstm_stock_model.h5')
    
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/index-history', methods=['GET'])
def index_history():
    """Fetch historical data for Indian market indices"""
    try:
        index_param = request.args.get('index', 'sensex').lower()
        period_param = request.args.get('period', '1mo').lower()
        
        # Map index names to Yahoo Finance tickers
        index_mapping = {
            'sensex': '^BSESN',
            'nifty': '^NSEI',
            'banknifty': '^NSEBANK'
        }
        
        # Validate parameters
        if index_param not in index_mapping:
            return jsonify({
                'success': False,
                'error': f'Invalid index. Supported: {list(index_mapping.keys())}'
            }), 400
        
        if period_param not in ['1mo', '3mo', '6mo', '1y']:
            return jsonify({
                'success': False,
                'error': 'Invalid period. Supported: 1mo, 3mo, 6mo, 1y'
            }), 400
        
        ticker = index_mapping[index_param]
        
        # Fetch data from Yahoo Finance
        df = yf.download(ticker, period=period_param, interval='1d', progress=False)
        
        if df.empty:
            return jsonify({
                'success': False,
                'error': f'No data available for {index_param}'
            }), 400
        
        # Handle MultiIndex columns (from yfinance)
        if isinstance(df.columns, pd.MultiIndex): # pyright: ignore[reportOptionalMemberAccess]
            df.columns = df.columns.get_level_values(0)
        
        # Reset index to get Date as column
        df.reset_index(inplace=True)
        
        # Ensure Date column exists and is datetime
        if 'Date' not in df.columns: # type: ignore
            df.rename(columns={"index": "Date"}, inplace=True)
        
        df['Date'] = pd.to_datetime(df['Date'])
        
        # Sort by date ascending
        df.sort_values('Date', inplace=True)
        
        # Calculate 50-day moving average
        df['MA50'] = df['Close'].rolling(window=50).mean()
        
        # Format output
        dates = df['Date'].dt.strftime('%Y-%m-%d').tolist()
        close = df['Close'].tolist()
        volume = df['Volume'].tolist() if 'Volume' in df.columns else [0] * len(df)
        ma50 = [float(v) if not pd.isna(v) else None for v in df['MA50'].tolist()]
        
        return jsonify({
            'success': True,
            'index': index_param,
            'period': period_param,
            'dates': dates,
            'close': close,
            'volume': volume,
            'ma50': ma50
        })
    
    except Exception as e:
        print(f"ERROR in index_history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/dashboard-data', methods=['GET'])
@firebase_required
def dashboard_data():
    try:
        df = predictor.original_data
        if df is None:
            return jsonify({
                "success": False,
                "error": "No data loaded"
            }), 400
        if df.empty:
            return jsonify({
                "success": False,
                "error": "No data loaded"
            }), 400
        df = df.copy()
        if df is not None and isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        if df is not None and 'Date' not in df.columns:
            df.reset_index(inplace=True)
        if df is not None:
            df['Date'] = pd.to_datetime(df['Date'])
        if df is None or 'Close' not in df.columns or df['Close'].empty:
            return jsonify({
                "success": False,
                "error": "No close price data available"
            }), 400
        close_series = df['Close']
        latest_price = float(close_series.iloc[-1])
        data_points = len(df)
        start_date = df['Date'].min().strftime('%Y-%m-%d')
        end_date = df['Date'].max().strftime('%Y-%m-%d')
        chart_data = {
            "dates": df['Date'].dt.strftime('%Y-%m-%d').tolist(),
            "prices": close_series.tolist()
        }
        return jsonify({
            "success": True,
            "latest_price": latest_price,
            "data_points": data_points,
            "date_range": f"{start_date} to {end_date}",
            "chart_data": chart_data
        })
    except Exception as e:
        print("DASHBOARD ERROR:", str(e))
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("\n" + "="*70)
    print("  "*10 + "STOCK PREDICTION API SERVER")
    print("  "*8 + "B.Sc. IT Final Year Project")
    print("="*70)
    print("\n📊 Server Configuration:")
    print(f"  • Host: 0.0.0.0")
    print(f"  • Port: 5000")
    print(f"  • Debug Mode: false")
    print(f"  • CORS: Enabled")
    print("\n🔗 Available Endpoints:")
    print("  • GET  /                    - Main web interface")
    print("  • GET  /api/health          - Health check")
    print("  • POST /api/generate-data   - Generate sample data")
    print("  • POST /api/upload-data     - Upload CSV data")
    print("  • POST /api/train           - Train model")
    print("  • GET  /api/evaluate        - Evaluate model")
    print("  • POST /api/predict-future  - Predict future prices")
    print("  • GET  /api/model-info      - Get model info")
    print("  • GET  /api/download-model  - Download trained model")
    print("\n✅ Server starting...")
    print("="*70 + "\n")
    
    app.run(host='0.0.0.0', port=5000, debug=False)
