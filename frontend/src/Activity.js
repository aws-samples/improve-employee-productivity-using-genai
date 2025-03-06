import React, { useState, useEffect, useRef } from 'react';
import { Form, Slider, Input, InputNumber, Button, Select, Switch, Row, Col, Tooltip, message, Upload, Card, Statistic, Space } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, UploadOutlined, CloseCircleOutlined, CopyOutlined } from '@ant-design/icons';
import { fetchTokenIfExpired } from './utils/authHelpers';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // or any other style you prefer
import './App.css';

const { TextArea } = Input;
const { Option } = Select;

const apiUrl = process.env.REACT_APP_API_URL;
const websocketUrl = process.env.REACT_APP_WEBSOCKET_URL;
const MAX_IMAGES = 6; // Maximum number of images

const modelOptions = [
  {
    id: "anthropic.claude-3-haiku-20240307-v1:0",
    name: "anthropic.claude-3-haiku-20240307-v1:0",
    supportsImages: true
  },
  {
    id: "anthropic.claude-3-5-haiku-20241022-v1:0",
    name: "anthropic.claude-3-5-haiku-20241022-v1:0",
    supportsImages: true
  },
  {
    id: "anthropic.claude-3-sonnet-20240229-v1:0",
    name: "anthropic.claude-3-sonnet-20240229-v1:0",
    supportsImages: true
  },
  {
    id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    name: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    supportsImages: true
  },
  {
    id: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    name: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    supportsImages: true
  },
  {
    id: "anthropic.claude-3-opus-20240229-v1:0",
    name: "anthropic.claude-3-opus-20240229-v1:0",
    supportsImages: true
  },
  {
    id: "anthropic.claude-v2:1",
    name: "anthropic.claude-v2:1",
    supportsImages: false
  },
  {
    id: "anthropic.claude-v2",
    name: "anthropic.claude-v2",
    supportsImages: false
  },
  {
    id: "anthropic.claude-instant-v1",
    name: "anthropic.claude-instant-v1",
    supportsImages: false
  },
  {
    id: "us.amazon.nova-micro-v1:0",
    name: "us.amazon.nova-micro-v1:0",
    supportsImages: false
  },
  {
    id: "us.amazon.nova-lite-v1:0",
    name: "us.amazon.nova-lite-v1:0",
    supportsImages: true
  },
  {
    id: "us.amazon.nova-pro-v1:0",
    name: "us.amazon.nova-pro-v1:0",
    supportsImages: true
  },
  {
    id: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    name: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    supportsImages: true,
    supportsThinking: true
  }
];

const Activity = ({ user }) => {
  const [form] = Form.useForm();
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0);
  const [topK, setTopK] = useState(250);
  const [topP, setTopP] = useState(0.999);
  const [maxTokensToSample, setMaxTokensToSample] = useState(4000);
  const [templates, setTemplates] = useState([]);
  const email = user?.email;
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const wsRef = useRef(null);
  const [selectedTemplateData, setSelectedTemplateData] = useState(null);
  const [combinedData, setCombinedData] = useState('');
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [modelVersion, setModelVersion] = useState('');
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [byteCount, setByteCount] = useState(0);
  const [inputPlaceholder, setInputPlaceholder] = useState('');
  const [uploadedImages, setUploadedImages] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const userId = user?.sub; // Assuming the user ID is available here
  const [systemPrompt, setSystemPrompt] = useState('');
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingBudgetTokens, setThinkingBudgetTokens] = useState(16000);
  const [currentThinking, setCurrentThinking] = useState("");
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 });
  const [latency, setLatency] = useState(0);
  const [previousTemperature, setPreviousTemperature] = useState(0);
  const [thinkingPanelVisible, setThinkingPanelVisible] = useState(true);

  useEffect(() => {
    if (selectedTemplateData) {
      // eslint-disable-next-line no-template-curly-in-string
      const newCombinedData = selectedTemplateData.templatePrompt.replace("${INPUT_DATA}", inputValue);
      setCombinedData(newCombinedData); // This updates the full prompt
      const bytes = new TextEncoder().encode(newCombinedData).length;
      setByteCount(bytes); // Update byte count for full prompt
      const words = newCombinedData.trim().split(/\s+/);
      setWordCount(words.length); // Update word count for full prompt
    }
  }, [inputValue, selectedTemplateData]);

  useEffect(() => {
    form.setFieldsValue({ modelId: modelVersion });
  }, [modelVersion, form]);

  useEffect(() => {
    const fetchTemplates = async () => {
      setIsTemplatesLoading(true); // Start loading
      try {
        const authorizationToken = await fetchTokenIfExpired();

        // Fetch public templates
        const publicResponse = await fetch(`${apiUrl}/templates?visibility=public`, {
          headers: {
            'Content-Type': 'application/json',
            'authorizationToken': authorizationToken
          }
        });
        const publicTemplates = await publicResponse.json();

        // Fetch user-specific templates
        const encodedEmail = encodeURIComponent(email);
        const userResponse = await fetch(`${apiUrl}/templates?createdBy=${encodedEmail}`, {
          headers: { authorizationToken }
        });
        const userTemplates = await userResponse.json();

        // Combine and remove duplicates
        const combinedTemplates = [...publicTemplates, ...userTemplates.filter(t => !publicTemplates.some(pt => pt.templateId === t.templateId))];

        setTemplates(combinedTemplates);
        setFilteredTemplates(combinedTemplates);

      } catch (error) {
        console.error('Error fetching templates:', error);
      } finally {
        setIsTemplatesLoading(false); // Stop loading regardless of success or failure
      }
    };

    fetchTemplates();
  }, [email]);

  const handleTemplateChange = (templateId) => {
    const templateSelected = templates.find(template => template.templateId === templateId);
    if (templateSelected) {
      setSelectedTemplateData(templateSelected);
      setModelVersion(templateSelected.modelversion);
      setInputPlaceholder(templateSelected.templateGuidance || 'Enter your input');
      setSystemPrompt(templateSelected.systemPrompt || '');
      setSelectedModel(templateSelected.modelversion);
      
      // Set default max tokens for Claude 3.7 models
      if (templateSelected.modelversion.includes('claude-3-7')) {
        setMaxTokensToSample(32000);
      }
      
      // Handle thinking mode settings
      if (templateSelected.thinkingEnabled) {
        setThinkingEnabled(true);
        setPreviousTemperature(temperature);
        setTemperature(1); // Set temperature to 1 when thinking mode is enabled
        if (templateSelected.thinkingBudgetTokens) {
          setThinkingBudgetTokens(templateSelected.thinkingBudgetTokens);
        }
      } else {
        setThinkingEnabled(false);
      }
      
      // Check if selected model supports images
      const selectedModelInfo = modelOptions.find(model => model.id === templateSelected.modelversion);
      if (!selectedModelInfo?.supportsImages) {
        setUploadedImages([]);
      }
    } else {
      console.error("Template not found");
    }
  };

  const handleEndOfTransmission = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsLoading(false);
  };

  const handleInputChange = (_, allValues) => {
    if (allValues && allValues.input) {
      setInputValue(allValues.input);
      
      // Update combined data whenever input changes
      if (selectedTemplateData) {
        // eslint-disable-next-line no-template-curly-in-string
        const newCombinedData = selectedTemplateData.templatePrompt.replace("${INPUT_DATA}", allValues.input);
        setCombinedData(newCombinedData);
        
        // Update byte count and word count
        const bytes = new TextEncoder().encode(newCombinedData).length;
        setByteCount(bytes);
        const words = newCombinedData.trim().split(/\s+/).filter(Boolean);
        setWordCount(words.length);
      }
    }
  };

  const handleFormSubmit = async (values) => {
    setIsLoading(true);
    setOutput('');
    // Reset thinking content when starting a new request
    setCurrentThinking('');
    // Reset token usage and latency metrics
    setTokenUsage({ inputTokens: 0, outputTokens: 0 });
    setLatency(0);

    if (!selectedTemplateData) {
      message.error("No template selected", 10);
      setIsLoading(false);
      return;
    }

    const authorizationToken = await fetchTokenIfExpired();
    const wsUrl = `${websocketUrl}?Authorization=${encodeURIComponent(authorizationToken)}`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      sendWebSocketMessage(values);
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      handleEndOfTransmission();
    };

    // Connect the WebSocket handler
    wsRef.current.onmessage = (event) => {
      try {
        const messageData = JSON.parse(event.data);
        if (messageData.action === 'error') {
          // Display error message using Ant Design's message component
          message.error(messageData.error, 10); // 10 seconds duration

          // Close WebSocket and stop loading
          handleEndOfTransmission();
          return; // Stop further processing
        }
        
        // Handle thinking content for Claude 3.7
        if (messageData.thinking) {
          console.log("Received thinking content:", messageData.thinking);
          setCurrentThinking(prev => prev + messageData.thinking);
        }
        
        // Handle redacted thinking
        else if (messageData.redacted_thinking) {
          message.info("Some thinking content was redacted for safety reasons");
        }
        
        // Handle metrics (token usage and latency)
        else if (messageData.metrics) {
          if (messageData.metrics.tokenUsage) {
            setTokenUsage(messageData.metrics.tokenUsage);
          }
          if (messageData.metrics.latency && messageData.metrics.latency.latencyMs) {
            setLatency(messageData.metrics.latency.latencyMs);
          }
        }
        
        // Handle regular message content
        else if (messageData.messages) {
          setOutput((prevOutput) => prevOutput + messageData.messages);
        }
        
        // Handle end of message
        if (messageData.endOfMessage) {
          handleEndOfTransmission();
        }
      } catch (error) {
        setOutput((prevOutput) => prevOutput + event.data);
      }
    };

    wsRef.current.onclose = () => {
      setIsLoading(false);
    };
  };

  const sendWebSocketMessage = (values) => {
    // Use combinedData which has the ${INPUT_DATA} already replaced with user input
    const messagePayload = {
      action: 'sendmessage',
      data: combinedData, // This contains the full prompt with input data replaced
      max_tokens_to_sample: Number(maxTokensToSample) || 4000,
      temperature: Number(temperature) || 0,
      modelId: modelVersion || "anthropic.claude-instant-v1",
      top_k: Number(topK) || 250,
      top_p: Number(topP) || 0.999,
    };

    // If an image was uploaded, include its S3 in the payload
    if (uploadedImages.length > 0) {
      const imageS3Keys = uploadedImages.map(image => image.s3Key);
      messagePayload.imageS3Keys = imageS3Keys;
    }

    if (systemPrompt) {
      messagePayload.system = systemPrompt; // Include the system message
    }
    
    // Add thinking parameters if thinking is enabled
    if (thinkingEnabled && selectedModel && selectedModel.includes('claude-3-7')) {
      messagePayload.thinking_enabled = true;
      messagePayload.thinking_budget_tokens = thinkingBudgetTokens;
    }

    console.log("Sending message payload:", messagePayload);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(messagePayload));
    } else {
      console.error('WebSocket is not connected.');
      handleEndOfTransmission();
    }
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    return hours < 12
      ? '🌅 Good morning,'
      : hours < 18
      ? '🌞 Good afternoon,'
      : '🌙 Good evening,';
  };

  const handleSearch = (value) => {
    const lowercasedValue = value.toLowerCase();
    const filteredData = templates.filter(template =>
      template.templateName.toLowerCase().includes(lowercasedValue) ||
      template.visibility.toLowerCase().includes(lowercasedValue)
    );
    setFilteredTemplates(filteredData);
  };

  const getVisibilityStyle = (visibility) => {
    return {
      color: visibility === 'public' ? 'green' : 'red',
      fontWeight: 'bold'
    };
  };

  const handleRemoveImage = (fileName) => {
    setUploadedImages(prev => prev.filter(img => img.name !== fileName));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        message.success('Copied to clipboard');
      })
      .catch(err => {
        message.error('Failed to copy text: ' + err);
      });
  };

  const handleImageUpload = async (file) => {
    setIsLoading(true);
    const authorizationToken = await fetchTokenIfExpired();
    const originalFileName = file.name;
    const fileName = `${userId}-${Date.now()}-${originalFileName}`; // Unique file name
    const fileType = file.type;

    try {
      // Step 1: Get the pre-signed URL from your backend
      const response = await fetch(`${apiUrl}/generatepresignedurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorizationToken': authorizationToken, // Make sure this matches your backend's expected header for tokens
        },
        body: JSON.stringify({ fileName, fileType }),
      });

      if (!response.ok) throw new Error('Failed to get a pre-signed URL');

      const { uploadUrl } = await response.json();

      // Step 2: Upload the file to S3 using the pre-signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': fileType,
        },
        body: file,
      });

      if (!uploadResponse.ok) throw new Error('Failed to upload file to S3');

      // Update state to reflect the uploaded file
      setUploadedImages(prevImages => [
        ...prevImages,
        { name: originalFileName, s3Key: fileName },
      ]);

      message.success(`${originalFileName} uploaded successfully`);

    } catch (error) {
      console.error('Error uploading file:', error);
      message.error(`Error uploading file: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderImageUploadSection = () => {
    const selectedModelInfo = modelOptions.find(model => model.id === selectedModel);
    if (selectedModelInfo?.supportsImages) {
      return (
        <Form.Item>
          <Tooltip title="You can upload a maximum of 6 images">
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>Upload Image(s)</Button>
            </Upload>
          </Tooltip>
          <div style={{ marginTop: 8 }}>
            {uploadedImages.map((image, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                {image.name}
                <CloseCircleOutlined onClick={() => handleRemoveImage(image.name)} style={{ color: 'red', marginLeft: 8, cursor: 'pointer' }} />
              </div>
            ))}
          </div>
        </Form.Item>
      );
    }
    return null;
  };

  const uploadProps = {
    beforeUpload: (file) => {
      const isAllowedType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
      if (!isAllowedType) {
        message.error(`${file.name} is not a supported image type`);
        return Upload.LIST_IGNORE;
      }
      if (uploadedImages.length >= MAX_IMAGES) {
        message.error(`You can only upload a maximum of ${MAX_IMAGES} images.`);
        return Upload.LIST_IGNORE;
      }
      handleImageUpload(file);
      return false;
    },
    showUploadList: false,
    accept: '.jpeg,.jpg,.png,.gif,.webp',
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
  
  const handleThinkingToggle = (enabled) => {
    setThinkingEnabled(enabled);
    
    if (enabled) {
      // Store current temperature and set to 1 for thinking mode
      setPreviousTemperature(temperature);
      setTemperature(1);
    } else {
      // Restore previous temperature when disabling thinking
      setTemperature(previousTemperature);
    }
  };

  const renderMetrics = () => {
    const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
    
    if ((totalTokens === 0 && latency === 0) && !isLoading) {
      return null;
    }
    
    return (
      <div style={{ marginTop: '20px', marginBottom: '20px' }}>
        <Card 
          size="small"
          title="Metrics"
          style={{ background: '#f9f9f9' }}
        >
          <Row gutter={16}>
            <Col span={6}>
              <Statistic 
                title="Input Tokens" 
                value={tokenUsage.inputTokens} 
                loading={isLoading && tokenUsage.inputTokens === 0}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="Output Tokens" 
                value={tokenUsage.outputTokens} 
                loading={isLoading && tokenUsage.outputTokens === 0}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="Total Tokens" 
                value={totalTokens} 
                loading={isLoading && totalTokens === 0}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="Latency (ms)" 
                value={latency} 
                loading={isLoading && latency === 0}
                precision={0}
                suffix="ms"
              />
            </Col>
          </Row>
        </Card>
      </div>
    );
  };

  const renderThinkingPanel = () => {
    if (!thinkingEnabled || (!currentThinking && !isLoading)) return null;
    
    // If panel is hidden, show a compact version with just a "Show" button
    if (!thinkingPanelVisible) {
      return (
        <div style={{ marginBottom: '20px' }}>
          <Button 
            type="default"
            onClick={() => setThinkingPanelVisible(true)}
            size="small"
            style={{ width: '100%' }}
          >
            💭 Show Claude's Thinking Process
          </Button>
        </div>
      );
    }
    
    // Otherwise show the full panel
    return (
      <div style={{ marginBottom: '20px' }}>
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                {isLoading && !currentThinking ? (
                  <>💭 Claude is thinking...</>
                ) : (
                  <>💭 Claude's Thinking Process</>
                )}
              </span>
              <Space>
                <Button 
                  type="text" 
                  onClick={() => copyToClipboard(currentThinking)}
                  size="small"
                  icon={<CopyOutlined />}
                  disabled={!currentThinking}
                >
                  Copy
                </Button>
                <Button 
                  type="text" 
                  onClick={() => setThinkingPanelVisible(false)}
                  size="small"
                >
                  Hide
                </Button>
              </Space>
            </div>
          }
          style={{ 
            background: '#f7f9fd', 
            border: '1px solid #d4e4fa',
            marginBottom: '16px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div 
            className="thinking-content" 
            style={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
              padding: '12px',
              background: '#fafafa',
              borderRadius: '4px',
              border: '1px solid #f0f0f0',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              whiteSpace: 'pre-wrap',
              fontSize: '14px',
              lineHeight: '1.6'
            }}
          >
            {isLoading && !currentThinking ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                Waiting for Claude to start thinking...
              </div>
            ) : (
              <ReactMarkdown
                className="markdown-body"
                rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
              >
                {currentThinking}
              </ReactMarkdown>
            )}
          </div>
        </Card>
      </div>
    );
  };

  return (
    <Form layout="vertical" onFinish={handleFormSubmit} onValuesChange={handleInputChange} form={form}>
      <div>
        {/* nosemgrep: jsx-not-internationalized */}
        <h1 style={{ marginTop: '-20px' }}>Activity</h1>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4A90E2' }}>
        {getGreeting()} {email}!
      </div>
      <br />
      <Form.Item label="Prompt Template">
        <Select
          showSearch
          placeholder="Select a template"
          onChange={handleTemplateChange}
          onSearch={handleSearch}
          filterOption={false} // Disable built-in filtering
          loading={isTemplatesLoading}
          listHeight={300}
        >
          {filteredTemplates.map(template => (
            <Option key={template.templateId} value={template.templateId}>
              {template.templateName} -{' '}
              <span style={getVisibilityStyle(template.visibility)}>
                {template.visibility}
              </span>
              {template.thinkingEnabled && (
                <span style={{ marginLeft: '5px', color: 'blue' }}>
                  (Thinking Mode)
                </span>
              )}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Row>
        <Col span={24} style={{ textAlign: 'left', marginBottom: 20 }}>
          <Switch checked={isAdvanced}
            onChange={() => setIsAdvanced(!isAdvanced)}
            checkedChildren="Advanced"
            unCheckedChildren="Basic" />
        </Col>
      </Row>

      {/* Additional settings form items */}
      {isAdvanced && (
        <>
          <Row gutter={[16, 16]}>
            {/* Model selection */}
            <Col span={24}>
              <Form.Item label="Model Selection" name="modelId">
                <Select
                  defaultValue={modelOptions[0].id}
                  onChange={(value) => {
                    setModelVersion(value);
                    setSelectedModel(value);
                    const selectedModelInfo = modelOptions.find(model => model.id === value);
                    if (!selectedModelInfo?.supportsImages) {
                      setUploadedImages([]); // Clear uploaded images if model doesn't support them
                    }
                    
                    // Set default max tokens for Claude 3.7 models
                    if (value.includes('claude-3-7')) {
                      setMaxTokensToSample(32000);
                    }
                  }}
                >
                  {modelOptions.map(model => (
                    <Option key={model.id} value={model.id}>
                      {model.name}
                      {model.supportsImages ? ' (Images)' : ''}
                      {model.supportsThinking ? ' (Thinking)' : ''}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            {/* Temperature */}
            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Temperature">
                <Slider
                  min={0}
                  max={1}
                  onChange={setTemperature}
                  value={temperature}
                  step={0.01}
                  marks={{ 0: '0', 1: '1' }}
                  disabled={thinkingEnabled} // Disable when thinking mode is enabled
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber
                  min={0}
                  max={1}
                  value={temperature}
                  onChange={setTemperature}
                  step={0.01}
                  disabled={thinkingEnabled} // Disable when thinking mode is enabled
                />
              </Form.Item>
            </Col>

            {/* Top K */}
            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Top K">
                <Slider
                  min={1}
                  max={250}
                  onChange={setTopK}
                  value={topK}
                  marks={{ 1: '1', 250: '250' }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber
                  min={1}
                  max={250}
                  value={topK}
                  onChange={setTopK}
                />
              </Form.Item>
            </Col>

            {/* Top P */}
            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Top P">
                <Slider
                  min={0}
                  max={0.999}
                  onChange={setTopP}
                  value={topP}
                  step={0.001}
                  marks={{ 0: '0', 0.999: '0.999' }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber
                  min={0}
                  max={0.999}
                  value={topP}
                  onChange={setTopP}
                  step={0.001}
                />
              </Form.Item>
            </Col>

            {/* Max Tokens To Sample */}
            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Max Tokens">
                <Slider
                  min={1}
                  max={selectedModel && selectedModel.includes('claude-3-7') ? 64000 : 6000}
                  onChange={setMaxTokensToSample}
                  value={maxTokensToSample}
                  step={1000}
                  marks={
                    selectedModel && selectedModel.includes('claude-3-7') 
                      ? { 1: '1', 32000: '32K', 64000: '64K' } 
                      : { 1: '1', 3000: '3K', 6000: '6K' }
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber
                  min={1}
                  max={selectedModel && selectedModel.includes('claude-3-7') ? 64000 : 6000}
                  value={maxTokensToSample}
                  onChange={setMaxTokensToSample}
                  step={1000}
                />
              </Form.Item>
            </Col>

            {/* Add Thinking Mode controls for Claude 3.7 models */}
            {selectedModel && selectedModel.includes('claude-3-7') && (
              <>
                <Col span={24}>
                  <Form.Item label="Thinking Mode">
                    <Switch 
                      checked={thinkingEnabled} 
                      onChange={handleThinkingToggle}
                    /> Enable Claude's step-by-step reasoning
                  </Form.Item>
                </Col>
                
                {thinkingEnabled && (
                  <>
                    <Col xs={12} sm={18} md={8} lg={8} xl={8}>
                      <Form.Item label="Thinking Budget (tokens)">
                        <Slider 
                          min={1024} 
                          max={24000} 
                          onChange={setThinkingBudgetTokens} 
                          value={thinkingBudgetTokens} 
                          step={1000}
                          marks={{ 1024: '1K', 4000: '4K', 24000: '24K' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={6} md={4} lg={4} xl={4}>
                      <Form.Item label="&nbsp;">
                        <InputNumber 
                          min={1024} 
                          max={24000} 
                          value={thinkingBudgetTokens} 
                          onChange={setThinkingBudgetTokens} 
                          step={1000}
                        />
                      </Form.Item>
                    </Col>
                  </>
                )}
              </>
            )}
          </Row>
        </>
      )}

      <Form.Item label={
        // nosemgrep: jsx-not-internationalized
        <span>
          Input&nbsp;
          <Tooltip title={showFullPrompt ? "Hide Full Prompt" : "Show Full Prompt"}>
            {showFullPrompt ? (
              <EyeInvisibleOutlined onClick={() => setShowFullPrompt(false)} />
            ) : (
              <EyeOutlined onClick={() => setShowFullPrompt(true)} />
            )}
          </Tooltip>
        </span>
      } name="input">
        <TextArea
          autoSize={{ minRows: 8, maxRows: 20 }}
          placeholder={inputPlaceholder}
        />
      </Form.Item>
      <div style={{ textAlign: 'right', fontSize: '12px', marginTop: '-16px' }}>
        {`Full Prompt Size: Words: ${wordCount} | Size: ${(byteCount / 1024).toFixed(2)} KB / 124 KB`}
      </div>

      {showFullPrompt && (
        <>
          {/* System Message Input */}

          <Form.Item label="System Prompt">
            <TextArea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt (optional)"
              autoSize={{ minRows: 2, maxRows: 6 }}
            />
          </Form.Item>

          <Form.Item label="User Data">
            <TextArea
              value={combinedData}
              readOnly
              autoSize={{ minRows: 8, maxRows: 20 }}
            />
          </Form.Item>
          <div style={{ textAlign: 'right', fontSize: '12px', marginTop: '-16px' }}>
            {`Full Prompt Size: Words: ${wordCount} | Size: ${(byteCount / 1024).toFixed(2)} KB / 124 KB`}
          </div>
        </>
      )}

      {renderImageUploadSection()}

      {/* Submit button and Output */}
      <Form.Item>
        {/* nosemgrep: jsx-not-internationalized */}
        <Button type="primary" htmlType="submit" loading={isLoading}>
          Submit
        </Button>
      </Form.Item>
      <Form.Item label="Output">
        <div className="output-container" style={{ width: '100%' }}>
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
            {output}
          </ReactMarkdown>
          <Tooltip title="Copy all">
            <CopyOutlined className="copy-icon" onClick={() => copyToClipboard(output)} />
          </Tooltip>
        </div>
      </Form.Item>

      {/* Thinking Panel */}
      {(isLoading || currentThinking) && renderThinkingPanel()}
      
      {/* Metrics Display */}
      {(tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0 || latency > 0) && renderMetrics()}
    </Form>
  );
};

export default Activity;
