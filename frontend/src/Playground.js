import React, { useState, useRef } from 'react';
import { Form, Slider, Input, InputNumber, Button, Select, Switch, Row, Col, message, Upload, Tooltip, Space, Card, Statistic } from 'antd';
import { fetchTokenIfExpired } from './utils/authHelpers';
import { UploadOutlined, CloseCircleOutlined, CopyOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css'; // or any other style you prefer
import './App.css';

const { Option } = Select;
const { TextArea } = Input;

const apiUrl = process.env.REACT_APP_API_URL;
const MAX_IMAGES = 11; // Maximum number of images

// Add this new constant for available models
const AVAILABLE_MODELS = [
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

const Playground = ({ user }) => {
  const [form] = Form.useForm();
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [temperature, setTemperature] = useState(0);
  const [topK, setTopK] = useState(250);
  const [topP, setTopP] = useState(0.999);
  const [maxTokensToSample, setMaxTokensToSample] = useState(4000);
  const email = user?.email;
  const websocketUrl = process.env.REACT_APP_WEBSOCKET_URL;
  const wsRef = useRef(null);
  const [wordCount, setWordCount] = useState(0);
  const [byteCount, setByteCount] = useState(0);
  const [uploadedImages, setUploadedImages] = useState([]);
  const MAX_BYTE_SIZE = 124 * 1024; // 124KB in bytes
  const [inputText, setInputText] = useState(''); // New state for controlling the input text
  const [selectedModel, setSelectedModel] = useState(AVAILABLE_MODELS[0].id);
  const userId = user?.userId; // Assuming the user ID is available here

  const [systemMessage, setSystemMessage] = useState(''); // State for storing the system message
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Add new state variables for thinking mode
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingBudgetTokens, setThinkingBudgetTokens] = useState(4000); // Changed default to 4000
  const [currentThinking, setCurrentThinking] = useState("");

  // Add state for controlling the thinking panel
  const [thinkingPanelVisible, setThinkingPanelVisible] = useState(true);
  
  // Store previous temperature to restore it when thinking is disabled
  const [previousTemperature, setPreviousTemperature] = useState(0);

  // Add state for token usage tracking
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 });
  // Add state for latency tracking
  const [latency, setLatency] = useState({ latencyMs: 0 });

  const handleEndOfTransmission = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsLoading(false);
  };

  const handleWebSocketMessage = (event) => {
    try {
      const messageData = JSON.parse(event.data);
      
      if (messageData.action === 'error') {
        message.error(messageData.error, 6);
        handleEndOfTransmission();
        return;
      }
      
      // Handle metrics updates (both token usage and latency)
      if (messageData.metrics) {
        if (messageData.metrics.tokenUsage) {
          setTokenUsage(messageData.metrics.tokenUsage);
        }
        if (messageData.metrics.latency) {
          setLatency(messageData.metrics.latency);
        }
        return;
      }
      
      // For backward compatibility - handle token usage updates directly
      if (messageData.tokenUsage) {
        setTokenUsage(messageData.tokenUsage);
        return;
      }
      
      // Handle thinking responses - update currentThinking and ensure panel is visible
      if (messageData.thinking) {
        setCurrentThinking((prev) => prev + messageData.thinking);
        if (thinkingEnabled) {
          setThinkingPanelVisible(true);
        }
        return;
      }
      
      if (messageData.redacted_thinking) {
        message.info("Some thinking content was redacted for safety reasons");
        return;
      }
      
      if (messageData.messages) {
        setOutput((prevOutput) => prevOutput + messageData.messages);
      }
      
      if (messageData.endOfMessage) {
        // No need to append thinking to output, as we're showing it separately
        handleEndOfTransmission();
      }
    } catch (error) {
      setOutput((prevOutput) => prevOutput + event.data);
    }
  };

  const handleFormSubmit = async (values) => {
    setIsLoading(true);
    setOutput('');
    setCurrentThinking(''); // Reset thinking content when submitting a new request
    setTokenUsage({ inputTokens: 0, outputTokens: 0 }); // Reset token usage
    setLatency({ latencyMs: 0 }); // Reset latency
    
    // Reset thinking panel visibility based on whether thinking is enabled
    if (thinkingEnabled && selectedModel.includes('claude-3-7')) {
      setThinkingPanelVisible(true);
    } else {
      setThinkingPanelVisible(false);
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

    wsRef.current.onmessage = handleWebSocketMessage;

    wsRef.current.onclose = () => {
      setIsLoading(false);
    };
  };

  const sendWebSocketMessage = (values) => {
    const messagePayload = {
      action: 'sendmessage',
      data: values.input,
      max_tokens_to_sample: Number(maxTokensToSample),
      temperature: Number(temperature),
      modelId: selectedModel || "anthropic.claude-3-haiku-20240307-v1:0",
      top_k: Number(topK),
      top_p: Number(topP),
    };

    // Add thinking parameters if enabled and using Claude 3.7 Sonnet
    if (thinkingEnabled && selectedModel.includes('claude-3-7')) {
      console.log("Adding thinking parameters");
      messagePayload.thinking_enabled = true;
      messagePayload.thinking_budget_tokens = thinkingBudgetTokens;
    }

    if (uploadedImages.length > 0) {
      const imageS3Keys = uploadedImages.map((image) => image.s3Key);
      messagePayload.imageS3Keys = imageS3Keys;
    }

    if (systemMessage) {
      messagePayload.system = systemMessage;
    }

    console.log("Sending websocket message:", messagePayload);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(messagePayload));
    } else {
      console.error('WebSocket is not connected.');
      handleEndOfTransmission();
    }
  };

  const handleInputChange = (e) => {
    const newText = e.target.value || '';
    const bytes = new TextEncoder().encode(newText).length;

    if (bytes <= MAX_BYTE_SIZE) {
      setInputText(newText);
      const words = newText.trim().split(/\s+/).filter(Boolean);
      setWordCount(words.length);
      setByteCount(bytes);
    } else {
      message.error('Maximum input size reached (124KB)', 10);
      form.setFieldsValue({ input: inputText });
    }
  };

  const handleImageUpload = async (file) => {
    try {
      setIsLoading(true);
      const authorizationToken = await fetchTokenIfExpired();
      const originalFileName = file.name;
      const fileName = `${userId}__FN__${originalFileName}`;
      const fileType = file.type;

      const response = await fetch(`${apiUrl}/generatepresignedurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorizationToken: authorizationToken,
        },
        body: JSON.stringify({ fileName, fileType }),
      });
      const data = await response.json();
      const uploadUrl = data.uploadUrl;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': fileType,
        },
        body: file,
      });

      if (uploadResponse.ok) {
        const updatedUploadedImages = [...uploadedImages, { name: originalFileName, s3Key: `${userId}__FN__${originalFileName}` }];
        if (updatedUploadedImages.length <= MAX_IMAGES) {
          setUploadedImages(updatedUploadedImages);
          message.success(`${originalFileName} uploaded successfully`);
        } else {
          message.error('Maximum number of images (6) reached.');
        }
      } else {
        throw new Error('File upload failed');
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('Code copied to clipboard');
    }).catch((err) => {
      console.error('Failed to copy text: ', err);
      message.error('Failed to copy code');
    });
  };

  const handleRemoveImage = (fileName) => {
    setUploadedImages(uploadedImages.filter((image) => image.name !== fileName));
  };

  const uploadProps = {
    beforeUpload: (file) => {
      const isAllowedType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
      if (!isAllowedType) {
        if (uploadedImages.length >= MAX_IMAGES) {
          message.error(`You can only upload a maximum of ${MAX_IMAGES} images.`);
          return Upload.LIST_IGNORE;
        }
      }
      handleImageUpload(file);
      return false;
    },
    showUploadList: false,
    accept: '.jpeg,.jpg,.png,.gif,.webp',
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    return hours < 12 ? '🌅 Good morning,' : hours < 18 ? '🌞 Good afternoon,' : '🌙 Good evening,';
  };

  const handleModelSelect = (value) => {
    setSelectedModel(value);
    const selectedModelInfo = AVAILABLE_MODELS.find(model => model.id === value);
    if (!selectedModelInfo?.supportsImages) {
      setUploadedImages([]);
    }
    
    // Set default max tokens for Claude 3.7 models
    if (value.includes('claude-3-7')) {
      const newMaxTokens = 32000;
      setMaxTokensToSample(newMaxTokens);
      
      // Update the form value to match the state
      form.setFieldsValue({ 
        maxTokensToSample: newMaxTokens,
        modelId: value 
      });
    } else {
      // For other models, use a more common default if the current value is too high
      if (maxTokensToSample > 6000) {
        const newMaxTokens = 4000;
        setMaxTokensToSample(newMaxTokens);
        
        // Update the form value to match the state
        form.setFieldsValue({ 
          maxTokensToSample: newMaxTokens,
          modelId: value 
        });
      } else {
        // Just update the model ID in the form
        form.setFieldsValue({ modelId: value });
      }
    }
    
    // Reset thinking state when switching models
    if (!value.includes('claude-3-7')) {
      setThinkingEnabled(false);
      // If temperature was set to 1 for thinking mode, restore it to previous value
      if (temperature === 1 && previousTemperature !== 1) {
        setTemperature(previousTemperature);
      }
    }
  };

  const renderImageUploadSection = () => {
    const selectedModelInfo = AVAILABLE_MODELS.find(model => model.id === selectedModel);
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
  

  const handleOptimizePrompt = async () => {
    try {
        setIsOptimizing(true);
        const authorizationToken = await fetchTokenIfExpired();
        
        const promptToOptimize = typeof inputText === 'string' ? inputText : '';
        
        const response = await fetch(`${apiUrl}/optimizeprompt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'authorizationToken': authorizationToken
            },
            body: JSON.stringify({
                prompt: promptToOptimize,
                targetModelId: selectedModel
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to optimize prompt');
        }

        // Extract the text from the nested response
        const optimizedText = data.optimizedPrompt?.optimizedPrompt?.textPrompt?.text;
        
        if (optimizedText) {
            // Remove extra quotes and replace \n with actual line breaks
            const cleanText = optimizedText
                .replace(/^"|"$/g, '') // Remove surrounding quotes
                .replace(/\\n/g, '\n'); // Replace \n with actual line breaks
            
            setInputText(cleanText);
            form.setFieldsValue({ input: cleanText });
            
            if (data.analysis) {
                message.info(data.analysis);
            }
            
            message.success('Prompt optimized successfully');
        } else {
            throw new Error('Invalid response format from optimization service');
        }
    } catch (error) {
        message.error(error.message || 'Failed to optimize prompt');
    } finally {
        setIsOptimizing(false);
    }
  };

  // Create a handler for thinking mode toggle that also sets temperature
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

  // Update function to render token usage and latency display
  const renderMetrics = () => {
    const totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
    
    if ((totalTokens === 0 && latency.latencyMs === 0) && !isLoading) {
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
                value={latency.latencyMs} 
                loading={isLoading && latency.latencyMs === 0}
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
    <Form layout="vertical" onFinish={handleFormSubmit} form={form}>
      <div>
        <h1 style={{ marginTop: '-20px' }}>Playground</h1>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4A90E2' }}>
        {getGreeting()} {email}!
      </div>
      <br />

      <Form.Item label="Model Selection" name="modelId">
        <Select defaultValue={AVAILABLE_MODELS[0].id} onSelect={handleModelSelect}>
          {AVAILABLE_MODELS.map(model => (
            <Option key={model.id} value={model.id}>
              {model.name}
              {model.supportsImages ? ' (Images)' : ''}
              {model.supportsThinking ? ' (Thinking)' : ''}
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Row>
        <Col span={24} style={{ textAlign: 'left', marginBottom: 20 }}>
          <Switch checked={isAdvanced} onChange={() => setIsAdvanced(!isAdvanced)} checkedChildren="Advanced" unCheckedChildren="Basic" />
        </Col>
      </Row>

      <Form.Item label="Input" name="input">
        <div>
          <TextArea 
            autoSize={{ minRows: 8, maxRows: 20 }} 
            value={inputText} 
            onChange={handleInputChange} 
          />
          <div style={{ marginTop: '8px' }}>
            <Space>
              <Button 
                type="default"
                onClick={handleOptimizePrompt}
                loading={isOptimizing}
                disabled={
                  !inputText || 
                  typeof inputText !== 'string' || 
                  !inputText.length || 
                  !['anthropic.claude-3-haiku-20240307-v1:0', 'anthropic.claude-3-opus-20240229-v1:0', 'anthropic.claude-3-sonnet-20240229-v1:0', 'anthropic.claude-3-sonnet-20241022-v2:0', 'anthropic.claude-3-5-sonnet-20240620-v1:0', 'us.amazon.nova-micro-v1:0', 'us.amazon.nova-lite-v1:0', 'us.amazon.nova-pro-v1:0'].includes(selectedModel)
                }
              >
                Optimize Prompt
              </Button>
              <span style={{ fontSize: '12px', color: '#888' }}>
                {`Words: ${wordCount} | Size: ${(byteCount / 1024).toFixed(2)} KB / 124 KB`}
              </span>
            </Space>
          </div>
        </div>
      </Form.Item>

      {renderImageUploadSection()}

      {isAdvanced && (
        <>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Form.Item label="System Prompt">
                <TextArea value={systemMessage} onChange={(e) => setSystemMessage(e.target.value)} placeholder="Enter system prompt (optional)" autoSize={{ minRows: 2, maxRows: 6 }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Temperature">
                <Slider min={0} max={1} onChange={setTemperature} value={temperature} step={0.01} marks={{ 0: '0', 1: '1' }} disabled={thinkingEnabled} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber min={0} max={1} value={temperature} onChange={setTemperature} step={0.01} disabled={thinkingEnabled} />
              </Form.Item>
            </Col>

            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Top K">
                <Slider min={1} max={250} onChange={setTopK} value={topK} marks={{ 1: '1', 250: '250' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber min={1} max={250} value={topK} onChange={setTopK} />
              </Form.Item>
            </Col>

            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Top P">
                <Slider min={0} max={0.999} onChange={setTopP} value={topP} step={0.001} marks={{ 0: '0', 0.999: '0.999' }} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber min={0} max={0.999} value={topP} onChange={setTopP} step={0.001} />
              </Form.Item>
            </Col>

            <Col xs={12} sm={18} md={8} lg={8} xl={8}>
              <Form.Item label="Max Tokens">
                <Slider 
                  min={1} 
                  max={selectedModel.includes('claude-3-7') ? 64000 : 6000} 
                  onChange={(value) => {
                    setMaxTokensToSample(value);
                    // Update form value
                    form.setFieldsValue({ maxTokensToSample: value });
                  }}
                  value={maxTokensToSample} 
                  step={1000}
                  marks={
                    selectedModel.includes('claude-3-7') 
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
                  max={selectedModel.includes('claude-3-7') ? 64000 : 6000} 
                  value={maxTokensToSample} 
                  onChange={(value) => {
                    setMaxTokensToSample(value);
                    // Update form value
                    form.setFieldsValue({ maxTokensToSample: value });
                  }}
                  step={1000}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Add Thinking Mode controls for Claude 3.7 models */}
          {selectedModel.includes('claude-3-7') && (
            <Row gutter={[16, 16]}>
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
            </Row>
          )}
        </>
      )}

      <Form.Item>
        <Button type="primary" htmlType="submit" loading={isLoading}>
          Submit
        </Button>
      </Form.Item>

      {renderThinkingPanel()}

      <Form.Item label="Output" style={{ marginBottom: 0 }}>
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
                        fontSize: '14px',
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

      {/* Display metrics (token usage and latency) */}
      {renderMetrics()}
    </Form>
  );
};

export default Playground;
