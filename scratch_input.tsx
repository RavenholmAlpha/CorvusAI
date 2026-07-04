import React, { useState } from 'react';
import { render, Box, Text, useInput } from 'ink';

function Test() {
  const [lastInput, setLastInput] = useState('');
  
  useInput((input, key) => {
    setLastInput(JSON.stringify({ input, key }));
    if (input === 'q') process.exit(0);
  });
  
  return (
    <Box>
      <Text>Last input: {lastInput}</Text>
    </Box>
  );
}

render(<Test />);
