 // nosemgrep: jsx-not-internationalized

import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom'; // <-- Change here
import { Layout } from 'antd';
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
  return (
    <Authenticator components={components} hideSignUp={true} loginMechanisms={['email']}>
      {({ signOut, user }) => (
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
