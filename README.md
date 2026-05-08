# 📈 Stock Market Prediction Web App
**A Deep Learning (LSTM) Project for Indian Stock Markets**

### 👨‍💻 Project Overview
This is a full-stack AI application built as a final year B.Sc. IT project at the University of Mumbai. It uses **Long Short-Term Memory (LSTM)** neural networks to predict future prices for NSE and BSE stocks.

### 🛠 Technical Architecture
* [cite_start]**AI Brain:** TensorFlow/Keras (LSTM Model) 
* [cite_start]**Backend:** Flask (Python) 
* **Database/Auth:** Firebase Admin SDK
* [cite_start]**Data Source:** Real-time data via yfinance API 

### 🚀 Key Features
* **Live Price Tracking:** Fetches current values for stocks like TCS and Reliance.
* **7-Day Forecasting:** Uses a 60-day "lookback" window to predict the next week's trend.
* **Secure Portal:** Protected by Firebase authentication for authorized users.
* **Error Handling:** Includes a training lock to prevent server crashes during AI processing.

**Developed by:** Aditya Chaudhari
