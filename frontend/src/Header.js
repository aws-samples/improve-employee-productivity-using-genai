 // nosemgrep: jsx-not-internationalized

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Drawer, Button } from 'antd';
import { useLocation, Link, useNavigate} from 'react-router-dom';
import { Auth } from 'aws-amplify';

const { Header } = Layout;

const AppHeader = ({user}) => {
  const location = useLocation();
  const navigate = useNavigate()
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);


  const signOut = async () => {
    try {
      await Auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out: ', error);
    }
  };

  useEffect(() => {
    const resizeHandler = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', resizeHandler);

    return () => {
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  const menuItemsMobile = [
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/playground">Playground</Link>,
      key: '/playground',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/chat">Chat</Link>,
      key: '/chat',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/activity">Activity</Link>,
      key: '/activity',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/history">History</Link>,
      key: '/history',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/templates">Templates</Link>,
      key: '/templates',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: (<Button type="text" style={{ color: '#ffffffa6' }} onClick={signOut}>Sign Out</Button>)
    }
  ];

  const menuItems = [
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/playground">Playground</Link>,
      key: '/playground',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/chat">Chat</Link>,
      key: '/chat',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/activity">Activity</Link>,
      key: '/activity',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/history">History</Link>,
      key: '/history',
    },
    {
      // nosemgrep: jsx-not-internationalized 
      label: <Link to="/templates">Templates</Link>,
      key: '/templates',
    },
  ];

  // Set the selected key based on the current route
  let selectedKey = location.pathname

  return (
    <Header className="header" style={{ display: 'flex', alignItems: 'center', padding: '0 60px', justifyContent: 'space-between' }}>
    <div className="logo" style={{ flex: 'none' }}>
      <Link to="/playground" style={{ display: 'flex', alignItems: 'center', color: 'white' }}>
       {/* nosemgrep: jsx-not-internationalized */}
      <span className="logo-text">
        {/* nosemgrep: jsx-not-internationalized */}
        <span>Employee Productivity GenAI</span>
        {/* nosemgrep: jsx-not-internationalized */}
        <span>Assistant Example</span>
      </span>
      </Link>
    </div>

    {windowWidth <= 900 ? (
        <div className="mobile-menu">
            <Button type="primary" onClick={() => setDrawerVisible(true)}>
                ☰
            </Button>
            <Drawer
                title="Menu"
                placement="left"
                closable={true}
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
            >
                <Menu
                theme="dark"
                mode="vertical"
                selectedKeys={[selectedKey]}
                items={menuItemsMobile}
                disabledOverflow={true}
                className="mobile-menu-content"
                onClick={() => setDrawerVisible(false)}
                />
            {/* nosemgrep: jsx-not-internationalized */}
            <Button  type="text" style={{ marginLeft: 'auto', color: '#ffffffa6' }} onClick={signOut} >Sign Out</Button>
            </Drawer>
        </div>
    ) : (
    <>
        {/* nosemgrep: jsx-not-internationalized */}
        <Menu
        theme="dark"
        mode="horizontal"
        selectedKeys={[selectedKey]}
        items={menuItems}
        disabledOverflow={true}
        style={{ borderBottom: 'none', minWidth: 20 }}
      />
      {/* nosemgrep: jsx-not-internationalized */}
      <Button  type="text" style={{ marginLeft: 'auto', color: '#ffffffa6' }} onClick={signOut} >
        {/* nosemgrep: jsx-not-internationalized */}
        Sign Out
      </Button>
    </>
    
    
    )}
    </Header>
);


};

export default AppHeader;
