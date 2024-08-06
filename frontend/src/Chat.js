 // nosemgrep: jsx-not-internationalized

import React, { useState, useRef, useEffect } from "react";
import {
  Input,
  Button,
  List,
  Avatar,
  Switch,
  Form,
  Select,
  Slider,
  Col,
  Row,
  message,
  Spin
} from "antd";
import { UserOutlined, RobotOutlined, CopyOutlined } from "@ant-design/icons";
import "./App.css";
import { fetchTokenIfExpired } from "./utils/authHelpers";
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'dompurify';


const { Option } = Select;

const apiUrl = process.env.REACT_APP_API_URL;

const ChatMessage = ({ text, sender }) => {
  const [isHovering, setIsHovering] = useState(false);

  const copyToClipboard = (text) => {
    if (typeof text === "string") {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          message.success("Copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
          message.error("Failed to copy text");
        });
    }
  };

  const formatText = (text) => {
    if (typeof text === "string") {
      // Escapes HTML tags, then replaces newline characters with HTML <br />
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br />");
    } else {
      return null;
    }
  };

  const renderContent = () => {
    if (typeof text === "string") {
      const sanitizedText = DOMPurify.sanitize(text);
      return <div dangerouslySetInnerHTML={{ __html: formatText(sanitizedText) }} />;
    } else {
      // Render React component directly
      return text;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: sender === "user" ? "end" : "start",
        margin: "10px 0",
        position: "relative",
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Avatar icon={sender === "user" ? <UserOutlined /> : <RobotOutlined />} />
      <div
        style={{
          backgroundColor: sender === "user" ? "lightgreen" : "lightblue",
          margin: "0 10px",
          padding: "5px 10px",
          borderRadius: "10px",
          wordWrap: "break-word",
          maxWidth: "70%",
          position: "relative",
        }}
      >
        {renderContent()}
        {isHovering && typeof text === "string" && (
          <CopyOutlined
            style={{
              position: "absolute",
              top: "5px",
              right: "5px",
              color: "#000",
              fontSize: "16px",
              cursor: "pointer",
            }}
            onClick={() => copyToClipboard(text)}
          />
        )}
      </div>
    </div>
  );
};

const Chat = ({ user }) => {
  const email = user?.email;
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Welcome to Employee Productivity GenAI Assistant Example CHat! How can I help?",
      sender: "bot",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const nextMessageId = useRef(1);
  const messageListRef = useRef(null);
  const ongoingBotMessageId = useRef(null); // To track the ongoing bot message
  const [isAdvanced, setIsAdvanced] = useState(false); // State to track mode
  const [temperature, setTemperature] = useState(0);
  const [topK, setTopK] = useState(250);
  const [topP, setTopP] = useState(0.999);
  const [maxTokensToSample, setMaxTokensToSample] = useState(4000);
  const [modelVersion, setModelVersion] = useState(
    "anthropic.claude-3-haiku-20240307-v1:0"
  );
  const [isLoading, setIsLoading] = useState(false); // State for button loading
  const [templates, setTemplates] = useState([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(undefined);
  const [selectedTemplateData, setSelectedTemplateData] = useState(null);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [inputPlaceholder, setInputPlaceholder] = useState("");
  // eslint-disable-next-line no-unused-vars
  const [IsWaitingForMessage ,setIsWaitingForMessage] = useState(false);
  const thinkingMessageId = -1; // A unique ID for the thinking message
  const [websocketStatus, setWebsocketStatus] = useState("Connecting");
  const [systemPrompt, setSystemPrompt] = useState(""); // State to store the system prompt


  const wsRef = useRef(null);
  const websocketUrl = process.env.REACT_APP_WEBSOCKET_URL; // Ensure you have the WebSocket URL
  const MAX_BYTE_SIZE = 124 * 1024; // 124KB in bytes
  // Ref to store the unique session ID
  const sessionIdRef = useRef(null);

  // Function to generate a random string
  const generateRandomString = () => {
    return uuidv4(); // Returns a secure random UUID
  };

  const toggleMode = () => {
    setIsAdvanced(!isAdvanced); // Toggle between basic and advanced mode
  };

  const initializeWebSocket = async () => {
    try {
      setWebsocketStatus("Connecting")
      const authorizationToken = await fetchTokenIfExpired();
      const wsUrl = `${websocketUrl}?Authorization=${encodeURIComponent(
        authorizationToken
      )}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log("WebSocket Connected");
        setWebsocketStatus("Connected");
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        message.error(error);
        setIsWaitingForMessage(false);
        setIsLoading(false);
        setWebsocketStatus("Disconnected");
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket Disconnected");
        setWebsocketStatus("Disconnected");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const messageData = JSON.parse(event.data);

          if (messageData.action === "error") {
            console.error(messageData.error);
            message.error(messageData.error);
            setIsLoading(false);
            setIsWaitingForMessage(false); // Stop showing the loading spin on error
            setMessages((prevMessages) => {
              // Remove the temporary loading message
              return prevMessages.filter((msg) => msg.id !== thinkingMessageId);
            });
            ongoingBotMessageId.current = null; // Reset the ongoing message ID
            return;
          }

          if (messageData.messages) {
            if (ongoingBotMessageId.current === null) {
              // Start a new bot message and stop showing the loading spin
              setIsWaitingForMessage(false);
              const newMessageId = nextMessageId.current++;
              setMessages((prevMessages) => {
                // Remove the temporary loading message
                return prevMessages
                  .filter((msg) => msg.id !== thinkingMessageId)
                  .concat({
                    id: newMessageId,
                    text: messageData.messages,
                    sender: "bot",
                  });
              });
              ongoingBotMessageId.current = newMessageId;
            } else {
              // Update the ongoing bot message with new chunks
              setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                  msg.id === ongoingBotMessageId.current
                    ? { ...msg, text: msg.text + messageData.messages }
                    : msg
                )
              );
            }
          }

          if (messageData.endOfMessage) {
            ongoingBotMessageId.current = null; // Reset for the next bot message
            setIsLoading(false);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };
    } catch (error) {
      console.error("Error initializing WebSocket:", error);
      message.error("Error connecting to WebSocket");
    }
  };

  useEffect(() => {
    initializeWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websocketUrl]);

  useEffect(() => {

    const fetchTemplates = async () => {
      setIsTemplatesLoading(true); // Start loading
      try {
        const authorizationToken = await fetchTokenIfExpired();
  
        // Fetch public templates
        const publicResponse = await fetch(
          `${apiUrl}/templates?visibility=public`,
          {
            headers: {
              "Content-Type": "application/json",
              authorizationToken: authorizationToken,
            },
          }
        );
        const publicTemplates = await publicResponse.json();
  
        // Fetch user-specific templates
        const userResponse = await fetch(
          `${apiUrl}/templates?createdBy=${email}`,
          {
            headers: { authorizationToken },
          }
        );
        const userTemplates = await userResponse.json();
  
        // Combine and remove duplicates
        const combinedTemplates = [
          ...publicTemplates,
          ...userTemplates.filter(
            (t) => !publicTemplates.some((pt) => pt.templateId === t.templateId)
          ),
        ];
  
        setTemplates(combinedTemplates);
        setFilteredTemplates(combinedTemplates);
      } catch (error) {
        console.error("Error fetching templates:", error);
      } finally {
        setIsTemplatesLoading(false); // Stop loading regardless of success or failure
      }
    };

    fetchTemplates();
    sessionIdRef.current = generateRandomString(20);
  }, [email]);

  useEffect(() => {
    if (selectedTemplate) {
      const templateData = templates.find(
        (template) => template.templateId === selectedTemplate
      );
      if (templateData) {
        setSelectedTemplateData(templateData);
      }
    }
  }, [selectedTemplate, templates]);

  useEffect(() => {
    if (selectedTemplateData) {
      setInputPlaceholder(
        selectedTemplateData.templateGuidance || "Enter your input"
      );
    }
  }, [selectedTemplateData]);

  

  // Function to handle template selection change
  const handleTemplateChange = (templateId) => {
    const selected = templates.find(
      (template) => template.templateId === templateId
    );
    setSelectedTemplate(templateId);

    if (selected) {
      setSelectedTemplateData(selected);
      // Update the model based on the selected template
      setModelVersion(selected.modelversion);
      setSystemPrompt(selected.systemPrompt || "");
    } else {
      setSelectedTemplateData(null);
      // Optionally reset the model to a default value if no template is selected or found
      setModelVersion("anthropic.claude-3-haiku-20240307-v1:0");
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      // Check if WebSocket is connected
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        // Try to reconnect if WebSocket is not open
        message.error("Websocket is not connected, reconnecting... Please send your message again!", 10);
        initializeWebSocket();
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const newMessageId = nextMessageId.current++;
        setIsWaitingForMessage(true);
        let sendData = inputValue;
        let displayMessage = inputValue;

        if (selectedTemplateData) {
          sendData = selectedTemplateData.templatePrompt.replace(
            "${INPUT_DATA}",  // eslint-disable-line no-template-curly-in-string
            inputValue
          );
          displayMessage = sendData;
        }

        setMessages([
          ...messages,
          { id: newMessageId, text: displayMessage, sender: "user" },
          { id: thinkingMessageId, text: <Spin />, sender: "bot" }, // Add the temporary thinking message
        ]);

        const messagePayload = {
          action: "chat",
          data: sendData, // Use inputValue as the prompt data
          max_tokens_to_sample: maxTokensToSample,
          temperature: temperature,
          modelId: modelVersion,
          top_k: topK,
          top_p: topP,
          session_id: sessionIdRef.current,
          system_prompt: systemPrompt 
        };

        wsRef.current.send(JSON.stringify(messagePayload));
        setIsLoading(true);

        setInputValue("");
        setSelectedTemplate(undefined); // Reset template selection
        setSelectedTemplateData(null);
      } else {
        console.error("WebSocket is not connected.");
        // Handle the case when WebSocket is not connected
      }

      setInputValue("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent the default action of the enter key
      if (!isLoading) {
        handleSend();
      }
    }
  };

  const handleInputChange = (e) => {
    const newInputValue = e.target.value;
    const tentativeCombinedData = selectedTemplateData
      ? selectedTemplateData.templatePrompt.replace(
          "${INPUT_DATA}",  // eslint-disable-line no-template-curly-in-string
          newInputValue
        )
      : newInputValue;

    const bytes = new TextEncoder().encode(tentativeCombinedData).length;

    if (bytes <= MAX_BYTE_SIZE) {
      setInputValue(newInputValue); // Update the input value state only if within limit
    } else {
      message.warning("Maximum input size reached (124KB)", 5);
      // Reset to the last valid input value
      Form.setFieldsValue({ input: inputValue });
    }
  };

  useEffect(() => {
    if (messageListRef.current) {
      // Timeout to ensure the message list updates before scrolling
      setTimeout(() => {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }, 1);
    }
  }, [messages]);

  const handleSearch = (value) => {
    const lowercasedValue = value.toLowerCase();
    const filteredData = templates.filter(
      (template) =>
        template.templateName.toLowerCase().includes(lowercasedValue) ||
        template.visibility.toLowerCase().includes(lowercasedValue)
    );
    setFilteredTemplates(filteredData);
  };

  const handleStatusClick = () => {
    if (websocketStatus === "Disconnected") {
      initializeWebSocket();
    }
  };

  const getVisibilityStyle = (visibility) => {
    return {
      color: visibility === "public" ? "green" : "red",
      fontWeight: "bold",
    };
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    return hours < 12
      ? "🌅 Good morning,"
      : hours < 18
      ? "🌞 Good afternoon,"
      : "🌙 Good evening,";
  };

  const mainContentStyle = {
    display: "flex",
    flexDirection: "row",
    height: "74vh",
    width: "100%", // Ensure the container takes full width
  };

  const chatStyle = isAdvanced
    ? { width: "70%", flexDirection: "column", display: "flex" }
    : { width: "100%", flexDirection: "column", display: "flex" };

  const advancedPanelInlineStyle = {
    width: "30%",
    backgroundColor: "#f0f2f5",
    padding: "20px",
    overflowY: "auto",
    // border: "1px solid #d9d9d9",
    display: isAdvanced ? "block" : "none", // Only display when isAdvanced is true
  };

  return (
    <div>
      <div>
        <div style={mainContentStyle}>
          <div style={chatStyle}>
            <div>
              {/* nosemgrep: jsx-not-internationalized */}
              <h1 style={{ marginTop: "-20px" }}>Chat</h1>
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: "bold", color: "#4A90E2" }}
            >
              {getGreeting()} {email}!
            </div>
            <br />
            <div>
              <Switch
                checked={isAdvanced}
                onChange={toggleMode}
                checkedChildren="Advanced"
                unCheckedChildren="Basic"
              />
            </div>
            {/* Line for visual separation added here */}
            <div
              style={{ borderTop: "2px solid #E8E8E8", marginTop: "20px" }}
            ></div>
            <div
              ref={messageListRef}
              style={{ overflowY: "auto", flexGrow: 1 }}
            >
              <List
                dataSource={messages}
                renderItem={(item) => (
                  <ChatMessage text={item.text} sender={item.sender} />
                )}
              />
            </div>
            <div
              style={{ borderTop: "2px solid #E8E8E8", marginTop: "20px" }}
            ></div>
            <div
              style={{
                display: "flex",
                padding: "10px",
                backgroundColor: "#fff",
              }}
            >
              <Input.TextArea
                value={inputValue}
                onChange={handleInputChange}
                style={{ flex: 1, marginRight: "10px" }}
                placeholder={inputPlaceholder || "Type a message..."}
                onKeyPress={handleKeyPress}
                autoSize={{ minRows: 1, maxRows: 6 }}
              />
              {/* nosemgrep: jsx-not-internationalized */}
              <Button type="primary" onClick={handleSend} loading={isLoading}>
                Send
              </Button>
            </div>

            {/* Add Prompt Template Select Dropdown */}
            <Form.Item style={{ padding: "10px" }}>
              <Select
                showSearch
                placeholder="Select a template (optional)"
                onChange={handleTemplateChange}
                onSearch={handleSearch}
                filterOption={false} // Disable built-in filtering
                loading={isTemplatesLoading}
                listHeight={300}
                value={selectedTemplate}
              >
                {filteredTemplates.map((template) => (
                  <Option key={template.templateId} value={template.templateId}>
                    {template.templateName} -{" "}
                    <span style={getVisibilityStyle(template.visibility)}>
                      {template.visibility}
                    </span>
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end", // Align to the right side
                marginTop: "-20px", // Reduce the top margin
                marginRight: "10px",
                cursor: websocketStatus === "Disconnected" ? "pointer" : "auto", // Change cursor style
              }}
              onClick={handleStatusClick} // Add onClick event handler
            >
              <div
                style={{
                  width: "12px",
                  height: "12px",
                  backgroundColor:
                    websocketStatus === "Connected" ? "green" : "red",
                  borderRadius: "50%",
                  marginRight: "5px",
                }}
              ></div>
              <span
                style={{
                  color: websocketStatus === "Connected" ? "green" : "red",
                }}
              >
                {websocketStatus}
              </span>
            </div>
          </div>
          {isAdvanced && (
            <div style={advancedPanelInlineStyle}>
              {/* nosemgrep: jsx-not-internationalized */}
              <h3 style={{ marginTop: "-10px" }}> Advanced Settings</h3>
              <Form layout="vertical">
                <Row gutter={[16, 16]}>
                  {/* Model selection */}
                  <Col span={24}>
                    <Form.Item label="Model Selection">
                      {/* nosemgrep: jsx-not-internationalized */}
                      <Select
                        onChange={setModelVersion}
                        defaultValue="anthropic.claude-3-haiku-20240307-v1:0" // Set the initial default value
                        value={modelVersion}
                      >
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-3-haiku-20240307-v1:0"
                        >anthropic.claude-3-haiku-20240307-v1:0
                        </Option>
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-3-sonnet-20240229-v1:0">
                          anthropic.claude-3-sonnet-20240229-v1:0
                        </Option>
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-3-5-sonnet-20240620-v1:0">
                          anthropic.claude-3-5-sonnet-20240620-v1:0
                        </Option>                        
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-3-opus-20240229-v1:0">
                          anthropic.claude-3-opus-20240229-v1:0
                        </Option>
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-v2:1">
                          anthropic.claude-v2:1
                        </Option>
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-v2">
                          anthropic.claude-v2
                        </Option>
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-instant-v1">
                          anthropic.claude-instant-v1
                        </Option>
                        {/* nosemgrep: jsx-not-internationalized */}
                        <Option value="anthropic.claude-v1">
                          anthropic.claude-v1
                        </Option>
                      </Select>
                    </Form.Item>
                  </Col>

                  {/* Temperature */}
                  <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                    <Form.Item label="Temperature">
                      <Slider
                        min={0}
                        max={1}
                        onChange={setTemperature}
                        value={temperature}
                        step={0.01}
                        marks={{ 0: "0", 1: "1" }}
                      />
                    </Form.Item>
                  </Col>

                  {/* Top K */}
                  <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                    <Form.Item label="Top K">
                      <Slider
                        min={1}
                        max={250}
                        onChange={setTopK}
                        value={topK}
                        marks={{ 1: "1", 250: "250" }}
                      />
                    </Form.Item>
                  </Col>

                  {/* Top P */}
                  <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                    <Form.Item label="Top P">
                      <Slider
                        min={0}
                        max={0.999}
                        onChange={setTopP}
                        value={topP}
                        step={0.001}
                        marks={{ 0: "0", 0.999: "0.999" }}
                      />
                    </Form.Item>
                  </Col>

                  {/* Max Tokens To Sample */}
                  <Col xs={24} sm={24} md={24} lg={12} xl={12}>
                    <Form.Item label="Max Tokens">
                      <Slider
                        min={1}
                        max={6000}
                        onChange={setMaxTokensToSample}
                        value={maxTokensToSample}
                        step={1}
                        marks={{ 1: "1", 6000: "6000" }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="System Prompt">
                  <Input.TextArea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Enter system prompt (optional)"
                    autoSize={{ minRows: 4, maxRows: 8 }}
                  />
                </Form.Item>
              </Form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;
