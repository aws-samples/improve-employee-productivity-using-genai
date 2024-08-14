// nosemgrep: jsx-not-internationalized

import React, { useState, useEffect } from "react";
import { Table, Button, message, Modal, Input, Typography } from "antd";
import { fetchTokenIfExpired } from "./utils/authHelpers"; // Ensure this path is correct
import { CopyOutlined } from "@ant-design/icons";
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // or any other style you prefer
import './App.css';

const apiUrl = process.env.REACT_APP_API_URL;

const { Text } = Typography;

const History = ({ user }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState({});
  const [historyData, setHistoryData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [isLoading, setIsLoading] = useState(false); // New loading state
  const email = user?.email;

  useEffect(() => {
    const fetchHistoryData = async () => {
      setIsLoading(true);
      let allData = [...historyData]; // Start with existing data
  
      const fetchPage = async (lastRequestEmail, lastRequestTimestamp) => {
        try {
          const authorizationToken = await fetchTokenIfExpired();
          let url = `${apiUrl}/history?email=${email}`;
          if (lastRequestEmail && lastRequestTimestamp) {
            url += `&last_key_email=${lastRequestEmail}`;
            url += `&last_key_timestamp=${lastRequestTimestamp}`
          }
  
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              authorizationToken: authorizationToken,
            },
          });
  
          if (!response.ok) {
            throw new Error('Failed to fetch data');
          }
  
          const pageData = await response.json();
     
          allData = [...allData, ...pageData.items];
          
          // If last_evaluated_key exists, recursively fetch the next page
          if (pageData.last_evaluated_key && pageData.last_evaluated_key.email && pageData.last_evaluated_key.timestamp) {
            await fetchPage(pageData.last_evaluated_key.email, pageData.last_evaluated_key.timestamp);
          } else {
            // This is the final page, or there was only one page
            allData.sort((a, b) => b.timestamp - a.timestamp);
            setHistoryData(allData);
            setFilteredData(allData); // Assuming you want the filtered data also updated
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Error fetching history data:", error);
          message.error("Failed to load history data");
          setIsLoading(false);
        }
        };
  
      await fetchPage();
    };

    fetchHistoryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    const lowercasedSearchText = searchText.toLowerCase();
    const filtered = historyData.filter(
      (item) =>
        item.modelId.toLowerCase().includes(lowercasedSearchText) ||
        item.promptData.toLowerCase().includes(lowercasedSearchText) ||
        item.completion.toLowerCase().includes(lowercasedSearchText)
    );
    setFilteredData(filtered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  

  const handleDelete = async (email, timestamp) => {
    try {
      const authorizationToken = await fetchTokenIfExpired();
      const deleteResponse = await fetch(`${apiUrl}/history`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          authorizationToken: authorizationToken,
        },
        body: JSON.stringify({
          email: email,
          timestamp: timestamp,
        }),
      });

      if (deleteResponse.ok) {
        // Remove the deleted item from historyData and filteredData
        const updatedHistoryData = historyData.filter(
          (item) => !(item.email === email && item.timestamp === timestamp)
        );
        const updatedFilteredData = filteredData.filter(
          (item) => !(item.email === email && item.timestamp === timestamp)
        );

        // Update the state with the new arrays
        setHistoryData(updatedHistoryData);
        setFilteredData(updatedFilteredData);
        message.success("Entry deleted successfully");
      } else {
        // Handle the error response here
        message.error("Failed to delete history entry");
      }
    } catch (error) {
      console.error("Error deleting history entry:", error);
      message.error("Failed to delete history entry");
    } finally {
      setIsModalVisible(false);
    }
  };

  const handleView = (recordId) => {
    const record = historyData.find((item) => item.requestId === recordId);
    // Process imageS3Keys to extract just the file names, ignoring the UUIDs
    if (record.imageS3Keys) {
      record.imageNames = record.imageS3Keys.map(key => {
        const parts = key.split('__FN__'); // Split the key at the '__FN__' separator
        return parts[1] || ''; // Return the second part, which is the filename
      }).join(', '); // Combine names into a single string
    }

    setCurrentRecord(record);
    setIsModalVisible(true);
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
  };

  const handleTableChange = (newPagination) => {
    setPagination(newPagination);
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "timestamp",
      key: "timestamp",
      sorter: (a, b) => a.timestamp - b.timestamp,
      render: (text) => new Date(text * 1000).toLocaleString(),
      width: 50,
    },
    {
      title: "Model",
      dataIndex: "modelId",
      key: "modelId",
      width: 100,
      responsive: ["xl"],
    },
    {
      title: "User Data",
      dataIndex: "promptData",
      key: "promptData",
      render: (text) => <div className="truncate-multiline">{text}</div>,
      width: 400,
      responsive: ["md"],
    },
    {
      title: "Output",
      dataIndex: "completion",
      key: "completion",
      render: (text) => <div className="truncate-multiline">{text}</div>,
      width: 400,
      responsive: ["lg"],
    },
    {
      title: "View",
      key: "view",
      width: 20,
      // nosemgrep: jsx-not-internationalized
      render: (_, record) => (
        <Button type="link" onClick={() => handleView(record.requestId)}>
          View
        </Button>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 20,
      responsive: ["md"],
      // nosemgrep: jsx-not-internationalized
      render: (_, record) => (
        <Button
          type="link"
          onClick={() => handleDelete(record.email, record.timestamp)}
        >
          Delete
        </Button>
      ),
    },
  ];

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('Copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      message.error('Failed to copy text');
    });
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    return hours < 12
      ? "🌅 Good morning,"
      : hours < 18
      ? "🌞 Good afternoon,"
      : "🌙 Good evening,";
  };

  const extractTextFromChildren = (children) => {
    if (!children) {
      return '';
    }
    if (typeof children === 'string') {
      return children;
    }
    if (Array.isArray(children)) {
      return children.map((child) => {
        if (typeof child === 'string') {
          return child;
        } else if (typeof child === 'object' && child.props && child.props.children) {
          return extractTextFromChildren(child.props.children);
        }
        return '';
      }).join('');
    }
    if (typeof children === 'object' && children.props && children.props.children) {
      return extractTextFromChildren(children.props.children);
    }
    return '';
  };

  return (
    <div>
      {/* nosemgrep: jsx-not-internationalized */}
      <h1 style={{ marginTop: "-20px" }}>History</h1>
      <div style={{ fontSize: "18px", fontWeight: "bold", color: "#4A90E2" }}>
        {getGreeting()} {email}!
      </div>
      <br />
      <br />
      <Input
        placeholder="Search..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <br />
      <br />
      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="requestId"
        onChange={handleTableChange}
        loading={isLoading}
        pagination={pagination}
        scroll={true}
      />
      <Modal
        title="History Details"
        visible={isModalVisible}
        onCancel={handleModalCancel}
        footer={[
          // nosemgrep: jsx-not-internationalized 
          <Button
            key="delete"
            type="primary"
            danger
            onClick={() =>
              handleDelete(currentRecord.email, currentRecord.timestamp)
            }
          >
            Delete
          </Button>,
        ]}
      >
        <p>
          {/* nosemgrep: jsx-not-internationalized */}
          <b>Date:</b>
        </p>
        <Input
          value={new Date(currentRecord.timestamp * 1000).toLocaleString()}
          readOnly
        />
        <p>
          {/* nosemgrep: jsx-not-internationalized */}
          <b>Model:</b>
        </p>
        <Input value={currentRecord.modelId} readOnly />
         {/* Conditionally render System Prompt if it exists */}
          {currentRecord.systemPrompt && (
            <>
              <p>
                {/* nosemgrep: jsx-not-internationalized */}
                <b>System Prompt:</b>
              </p>
              <div className="input-with-copy-icon">
                <Input.TextArea
                  value={currentRecord.systemPrompt}
                  readOnly
                  style={{ resize: "vertical", width: "100%", minHeight: "100px" }}
                />
                <span
                  className="copy-icon"
                  onClick={() => copyToClipboard(currentRecord.systemPrompt)}
                >
                  <CopyOutlined />
                </span>
              </div>
            </>
          )}
        <p>
          {/* nosemgrep: jsx-not-internationalized */}
          <b>User Data:</b>
        </p>
        <div className="input-with-copy-icon">
          <Input.TextArea
            value={currentRecord.promptData}
            readOnly
            style={{ resize: "vertical", width: "100%", minHeight: "200px" }}
          />
          <span
            className="copy-icon"
            onClick={() => copyToClipboard(currentRecord.promptData)}
          >
            <CopyOutlined />
          </span>
        </div>
        {/* Conditionally render Images read-only box if there are images */}
        {currentRecord.imageNames && (
          <>
            <p>
              {/* nosemgrep: jsx-not-internationalized */}
              <b>Images:</b>
            </p>
            <Input.TextArea value={currentRecord.imageNames} readOnly autoSize />
          </>
        )}
        <p>
          {/* nosemgrep: jsx-not-internationalized */}
          <b>Output:</b>
        </p>
        <div className="input-with-copy-icon" style={{ position: 'relative', minHeight: '200px' }}>
  <div
    style={{
      resize: 'vertical',
      width: '100%',
      minHeight: '200px',
      maxHeight: '400px', // Adjust max height as needed
      overflow: 'auto',
      border: '1px solid #d9d9d9',
      borderRadius: '4px',
      padding: '9px 11px',
      background: '#fafafa',
    }}
  >
    <ReactMarkdown
      className="markdown-body"
      rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const codeContent = extractTextFromChildren(children).replace(/\n$/, '');
          return !inline && match ? (
            <div style={{ position: 'relative' }}>
                <code className={className} {...props}>
                  {children}
                </code>
              <CopyOutlined
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  color: '#1890ff',
                }}
                onClick={() => copyToClipboard(codeContent)}
              />
            </div>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {currentRecord.completion}
    </ReactMarkdown>
  </div>
  <span
    className="copy-icon"
    onClick={() => copyToClipboard(currentRecord.completion)}
    style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      cursor: 'pointer',
    }}
  >
    <CopyOutlined />
  </span>
</div>
        <p />
        <Text>
          {/* nosemgrep: jsx-not-internationalized */}
          <b> Created by:</b> {currentRecord.email}
        </Text>
      </Modal>
    </div>
  );
};

export default History;
