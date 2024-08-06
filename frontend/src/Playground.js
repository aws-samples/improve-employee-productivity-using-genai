 // nosemgrep: jsx-not-internationalized

import React, { useState, useRef } from 'react';
import { Form, Slider, Input, InputNumber,  Button, Select, Switch, Row, Col, message, Upload, Tooltip  } from 'antd';
import { fetchTokenIfExpired } from './utils/authHelpers';
import { UploadOutlined, CloseCircleOutlined, CopyOutlined } from '@ant-design/icons';


const { Option } = Select;
const { TextArea } = Input;

const apiUrl = process.env.REACT_APP_API_URL;
const MAX_IMAGES = 6; // Maximum number of images


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
  const [selectedModel, setSelectedModel] = useState("anthropic.claude-3-haiku-20240307-v1:0"); // Track selected model
  const userId = user?.userId; // Assuming the user ID is available here


  const [systemMessage, setSystemMessage] = useState(''); // State for storing the system message
  
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
          message.error(messageData.error, 6); // 10 seconds duration
  
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
      data: values.input, // This is your prompt data
      max_tokens_to_sample: Number(values.maxTokensToSample) || 4000,
      temperature: Number(temperature) || 0,
      modelId: values.modelId || "anthropic.claude-3-haiku-20240307-v1:0",
      top_k: Number(topK) || 250,
      top_p: Number(topP) || 0.999,
    };

    // If an image was uploaded, include its S3 in the payload
    if (uploadedImages.length > 0) {
      const imageS3Keys = uploadedImages.map(image => image.s3Key);
      messagePayload.imageS3Keys = imageS3Keys;
    }

    if (systemMessage) {
      messagePayload.system = systemMessage; // Include the system message
    }
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(messagePayload));
    } else {
      console.error('WebSocket is not connected.');
      handleEndOfTransmission();
    }
  };

  const handleInputChange = (e) => {
    const newText = e.target.value;
    const bytes = new TextEncoder().encode(newText).length;

    if (bytes <= MAX_BYTE_SIZE) {
      setInputText(newText); // Update text only if within limit
      const words = newText.trim().split(/\s+/).filter(Boolean);
      setWordCount(words.length);
      setByteCount(bytes);
    } else {
      message.error('Maximum input size reached (124KB)', 10);
      // Do not update inputText if it exceeds the limit
      form.setFieldsValue({ input: inputText });
    }
  };

  const handleImageUpload = async (file) => {
    try {
      setIsLoading(true);
      const authorizationToken = await fetchTokenIfExpired();
      const originalFileName = file.name; // Store the original file name
      const fileName = `${userId}__FN__${originalFileName}`; // Create a unique file name for S3
      const fileType = file.type;

      // Step 1: Get the pre-signed URL from your API Gateway
      const response = await fetch(`${apiUrl}/generatepresignedurl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authorizationToken': authorizationToken,
        },
        body: JSON.stringify({ fileName, fileType }),
      });
      const data = await response.json();
      const uploadUrl = data.uploadUrl;

      // Step 2: Upload the file using the pre-signed URL
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

const handleRemoveImage = (fileName) => {
  setUploadedImages(uploadedImages.filter(image => image.name !== fileName));
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
    // multiple: true,
    showUploadList: false,
    accept: ".jpeg,.jpg,.png,.gif,.webp", // Restrict file types in the file selector
  };


  const getGreeting = () => {
    const hours = new Date().getHours();
    return hours < 12
      ? '🌅 Good morning,'
      : hours < 18
      ? '🌞 Good afternoon,'
      : '🌙 Good evening,';
  };

  // Update the onSelect handler for the Select component
  const handleModelSelect = (value) => {
    setSelectedModel(value);
    // Check if the new model does not support image uploads
    if (value !== "anthropic.claude-3-haiku-20240307-v1:0" && value !== "anthropic.claude-3-sonnet-20240229-v1:0" && value !== "anthropic.claude-3-opus-20240229-v1:0" && value !== "anthropic.claude-3-5-sonnet-20240620-v1:0") {
      // Clear the uploaded images
      setUploadedImages([]);
    }
  };

  // Conditionally render the Upload Images section
  const renderImageUploadSection = () => {
    if (selectedModel === "anthropic.claude-3-haiku-20240307-v1:0" || selectedModel === "anthropic.claude-3-sonnet-20240229-v1:0" ||  selectedModel === "anthropic.claude-3-opus-20240229-v1:0" ||  selectedModel === "anthropic.claude-3-5-sonnet-20240620-v1:0") {
      return (
        <Form.Item>
          <Tooltip title="You can upload a maximum of 6 images">
              <Upload
                  beforeUpload={uploadProps.beforeUpload}
                  showUploadList={uploadProps.showUploadList}
                  accept={uploadProps.accept}
                >
               { /* nosemgrep: jsx-not-internationalized */}
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

  return (
    <Form layout="vertical" onFinish={handleFormSubmit} form={form}>
      <div>
        { /* nosemgrep: jsx-not-internationalized */} 
        <h1 style={{ marginTop: '-20px' }}>Playground</h1>
      </div>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4A90E2' }}>
          {getGreeting()} {email}!
      </div>
      <br />
     

      {/* Model selection */}
      <Form.Item label="Model Selection" name="modelId">
        <Select defaultValue="anthropic.claude-3-haiku-20240307-v1:0" onSelect={handleModelSelect}>
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-3-haiku-20240307-v1:0">anthropic.claude-3-haiku-20240307-v1:0</Option>
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-3-sonnet-20240229-v1:0">anthropic.claude-3-sonnet-20240229-v1:0</Option>
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-3-5-sonnet-20240620-v1:0">anthropic.claude-3-5-sonnet-20240620-v1:0</Option>    
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-3-opus-20240229-v1:0">anthropic.claude-3-opus-20240229-v1:0</Option>
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-v2:1">anthropic.claude-v2:1</Option>
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-v2">anthropic.claude-v2</Option>
          { /* nosemgrep: jsx-not-internationalized */}
          <Option value="anthropic.claude-instant-v1">anthropic.claude-instant-v1</Option>
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


      {/* <br /> */}   
    
      <Form.Item label="Input" name="input">
        <TextArea autoSize={{ minRows: 8, maxRows: 20 }} 
         value={inputText} // Controlled by the inputText state
         onChange={handleInputChange} // Update based on input change
         />
      </Form.Item>
      <div style={{ textAlign: 'right', fontSize: '12px', marginTop: '-16px' }}>
        {`Words: ${wordCount} | Size: ${(byteCount / 1024).toFixed(2)} KB / 124 KB`}
      </div>

      {/* Call the function to conditionally render the upload section */}
      {renderImageUploadSection()}

      

    {isAdvanced && (
      <>
      {/* System Message Input */}
      <Row gutter={[16, 16]}>
            <Col span={24}>
              <Form.Item label="System Prompt">
                <TextArea
                  value={systemMessage}
                  onChange={(e) => setSystemMessage(e.target.value)}
                  placeholder="Enter system prompt (optional)"
                  autoSize={{ minRows: 2, maxRows: 6 }}
                />
              </Form.Item>
            </Col>
          </Row>

      <Row gutter={[16, 16]}>
      
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

      

      {/* Submit button and Output */}
      <Form.Item>
        { /* nosemgrep: jsx-not-internationalized */}
        <Button type="primary" htmlType="submit" loading={isLoading}>
          Submit
        </Button>
      </Form.Item>


      <Form.Item label="Output">
      <div style={{ position: 'relative' }}>
        <TextArea
          value={output}
          readOnly
          autoSize={{ minRows: 10, maxRows: 16 }}
        />
        <Tooltip title="Copy to clipboard">
          <CopyOutlined
            style={{
              position: 'absolute',
              top: '5px', // Adjust the value as needed
              right: '14px', // Adjust the value as needed
              fontSize: '16px',
              cursor: 'pointer',
            }}
            onClick={() => {
              navigator.clipboard.writeText(output).then(() => {
                message.success('Copied to clipboard');
              }).catch(err => {
                console.error('Failed to copy text: ', err);
                message.error('Failed to copy text');
              });
            }}
          />
        </Tooltip>
      </div>
    </Form.Item>
    </Form>
    
  );
};

export default Playground;
