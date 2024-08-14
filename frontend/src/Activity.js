import React, { useState, useEffect, useRef } from 'react';
import { Form, Slider, Input, InputNumber, Button, Select, Switch, Row, Col, Tooltip, message, Upload } from 'antd';
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

  const MAX_BYTE_SIZE = 124 * 1024; // 124KB in bytes

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
        const userResponse = await fetch(`${apiUrl}/templates?createdBy=${email}`, {
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
      setInputPlaceholder(templateSelected.templateGuidance || 'Enter your input'); // Set the input placeholder
      setSystemPrompt(templateSelected.systemPrompt || '');
      // Don't set combinedData here as useEffect will take care of it

      // New logic to handle model change and image support
      setSelectedModel(templateSelected.modelversion);
      if (!['anthropic.claude-3-haiku-20240307-v1:0', 'anthropic.claude-3-sonnet-20240229-v1:0', 'anthropic.claude-3-opus-20240229-v1:0', 'anthropic.claude-3-5-sonnet-20240620-v1:0'].includes(templateSelected.modelversion)) {
        setUploadedImages([]); // Clear uploaded images if model does not support them
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

  const handleFormSubmit = async (values) => {
    setIsLoading(true);
    setOutput('');

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
        if (messageData.messages) {
          setOutput((prevOutput) => prevOutput + messageData.messages);
        }
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
    const messagePayload = {
      action: 'sendmessage',
      data: combinedData, // This is your prompt data
      max_tokens_to_sample: Number(values.maxTokensToSample) || 4000,
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

  const handleInputChange = (_, allValues) => {
    const newInputValue = allValues.input || '';
    const tentativeCombinedData = selectedTemplateData
      ? selectedTemplateData.templatePrompt.replace("${INPUT_DATA}", newInputValue) // eslint-disable-line no-template-curly-in-string
      : newInputValue;

    const bytes = new TextEncoder().encode(tentativeCombinedData).length;

    if (bytes <= MAX_BYTE_SIZE) {
      setInputValue(newInputValue); // Update the input value state only if within limit
    } else {
      message.warning('Maximum input size reached (124KB)', 5);
      // Reset to the last valid input value
      form.setFieldsValue({ input: inputValue });
    }
  };

  const handleRemoveImage = (fileName) => {
    setUploadedImages(uploadedImages.filter(image => image.name !== fileName));
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
      return false; // Prevent automatic upload by antd's Upload component
    },
    showUploadList: false,
    accept: ".jpeg,.jpg,.png,.gif,.webp", // Restrict file types in the file selector
  };

  // Conditionally render the Upload Images section
  const renderImageUploadSection = () => {
    if (['anthropic.claude-3-haiku-20240307-v1:0', 'anthropic.claude-3-sonnet-20240229-v1:0', 'anthropic.claude-3-opus-20240229-v1:0', 'anthropic.claude-3-5-sonnet-20240620-v1:0'].includes(selectedModel)) {
      return (
        <Form.Item>
          <Tooltip title="You can upload a maximum of 6 images">
            <Upload
              beforeUpload={uploadProps.beforeUpload}
              showUploadList={uploadProps.showUploadList}
              accept={uploadProps.accept}
            >
              {/* nosemgrep: jsx-not-internationalized */}
              <Button icon={<UploadOutlined />}>Upload Image(s)</Button>
            </Upload>
          </Tooltip>
          <div style={{ marginTop: 8 }}>
            {uploadedImages.map((image, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                {image.name}
                <CloseCircleOutlined
                  onClick={() => handleRemoveImage(image.name)}
                  style={{ color: 'red', marginLeft: 8, cursor: 'pointer' }}
                />
              </div>
            ))}
          </div>
        </Form.Item>
      );
    }
    return null;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('Code copied to clipboard');
    }).catch((err) => {
      console.error('Failed to copy text: ', err);
      message.error('Failed to copy code');
    });
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
      {/* Temperature slider */}
      {isAdvanced && (
        <>

          <Row gutter={[16, 16]}>
            {/* Model selection */}
            <Col span={24}>
              <Form.Item label="Model Selection" name="modelId">
                <Select
                  defaultValue="anthropic.claude-3-haiku-20240307-v1:0"
                  onChange={(value) => {
                    setModelVersion(value);
                    setSelectedModel(value); // Ensure this updates the selectedModel state

                    // If the new model does not support image uploads, clear any selected images
                    if (!['anthropic.claude-3-haiku-20240307-v1:0', 'anthropic.claude-3-sonnet-20240229-v1:0', 'anthropic.claude-3-opus-20240229-v1:0'].includes(value)) {
                      setUploadedImages([]); // Clear uploaded images if model does not support them
                    }
                  }}
                >
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-3-haiku-20240307-v1:0">anthropic.claude-3-haiku-20240307-v1:0</Option>
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-3-sonnet-20240229-v1:0">anthropic.claude-3-sonnet-20240229-v1:0</Option>
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-3-5-sonnet-20240620-v1:0">anthropic.claude-3-5-sonnet-20240620-v1:0</Option>
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-3-opus-20240229-v1:0">anthropic.claude-3-opus-20240229-v1:0</Option>
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-v2:1">anthropic.claude-v2:1</Option>
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-v2">anthropic.claude-v2</Option>
                  {/* nosemgrep: jsx-not-internationalized */}
                  <Option value="anthropic.claude-instant-v1">anthropic.claude-instant-v1</Option>
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
                  max={6000}
                  onChange={setMaxTokensToSample}
                  value={maxTokensToSample}
                  step={1}
                  marks={{ 1: '1', 6000: '6000' }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4} lg={4} xl={4}>
              <Form.Item label="&nbsp;">
                <InputNumber
                  min={1}
                  max={6000}
                  value={maxTokensToSample}
                  onChange={setMaxTokensToSample}
                  step={1}
                />
              </Form.Item>
            </Col>
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
    </Form>
  );
};

export default Activity;
