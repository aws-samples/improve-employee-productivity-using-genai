 // nosemgrep: jsx-not-internationalized

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'; // <-- Change here
import { Layout, Spin } from 'antd';
import './App.css';
import AppHeader from './Header';
import Playground from './Playground';
import Templates from './Templates'
import AppFooter from './Footer';
import { Authenticator } from '@aws-amplify/ui-react';
import CustomAuthHeader from './CustomAuthHeader';
import Activity from './Activity'; // New Activity Component
import History from './History'; // New History Component
import Chat from './Chat';
import '@aws-amplify/ui-react/styles.css';
import { fetchUserAttributes, getCurrentUser } from 'aws-amplify/auth';


const { Content } = Layout;

const components = {
  Header() {
    // ... (Header component for general use)
  },
  Footer() {
    // ... (Footer component for general use)
  },
  SignIn: {
    Header: CustomAuthHeader, // Use the CustomAuthHeader for the SignIn Header
    // ... (other sign-in customization if needed)
  },
  // ... (other components)
};


function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        const attributes = await fetchUserAttributes();
        setUser({
          userId: currentUser.userId,
          email: attributes.email,
          // Add any other attributes you need
        });
      } catch (error) {
        console.error('Error fetching user info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Authenticator components={components} hideSignUp={true} loginMechanisms={['email']}>
      {({ signOut }) => (
        <Router>
        <Layout className="layout">
          <AppHeader user={user} />
          <Content style={{ padding: '0 50px' }}>
            <div className="site-layout-content">
            <Routes>
            <Route path="/playground" element={<Playground user={user} />} />
            <Route path="/chat" element={<Chat user={user} />} />
            <Route path="/activity" element={<Activity user={user} /> } /> 
            <Route path="/templates" element={<Templates user={user} />} />
            <Route path="/history" element={<History user={user} />} />
            <Route path="/" element={<Navigate to="/playground" replace />} /> 
          </Routes>
            </div>
          </Content>
          <AppFooter user={user} />
        </Layout>
      </Router>
      )}
    </Authenticator>
  );
}

export default App;
