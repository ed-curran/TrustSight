import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {update} from 'jdenticon';

const Jdenticon = ({ value, size = '100%', className }: {value: string, size: string, className: string}) => {
  const icon = useRef(null);
  useEffect(() => {
    if(icon.current)
      update(icon.current, value);
  }, [value]);

  return (
    <>
      <svg data-jdenticon-value={value} height={size} ref={icon} width={size} className={className} />
    </>
  );
};

Jdenticon.propTypes = {
  size: PropTypes.string,
  value: PropTypes.string.isRequired
};
export default Jdenticon;